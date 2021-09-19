import imdb
import json
import os
import logging

from urllib.parse import urlparse

from flask import (
    Flask,
    redirect,
    make_response,
    request,
    send_from_directory,
    render_template
)
import psycopg2.extras

url = urlparse(os.environ.get('IMDB_DB'))
insecure_redirect = os.environ.get('SECURE_REDIRECT_URL', False)

app = Flask(__name__, root_path='./')
i = imdb.IMDb()

conn = psycopg2.connect(
    database=url.path[1:],
    user=url.username,
    password=url.password,
    host=url.hostname,
    port=url.port
)
conn.autocommit = True
cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)


@app.before_first_request
def setup_logging():
    logger = logging.getLogger('deadonfilm')
    logger.setLevel(logging.DEBUG)
    app.logger.addHandler(logger)
    app.logger.setLevel(logging.DEBUG)


@app.route('/')
def index():
    if insecure_redirect and not request.is_secure:
        return redirect(insecure_redirect, code=301)
    return render_template('index.html')


@app.route('/search/')
def search():
    """
    Find movie by title search (using IMDb API). Query argument ``q``.
    """
    app.logger.info('Searching for %s' % request.args.get('q'))
    movie = request.args.get('q')
    m = i.search_movie(movie)
    resp = make_response(json.dumps(
        [{
            'value': mt['long imdb title'],
            'id': mt.getID()
        } for mt in m if mt.get('kind') == 'movie']))
    resp.headers['Content-Type'] = 'application/json'
    resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp


@app.route('/died/', methods=['POST'])
def died():
    """
    Who died from the movie with the given IMDb id?
    """
    movie_id = request.form['id']
    movie = i.get_movie(movie_id, info=["full credits"])
    if movie is None:
        resp = make_response("Movie not found: {}".format(movie_id, 404))
    else:
        actors = movie.data['cast']
        actors_by_id = {}
        for actor in actors:
            actors_by_id[int(actor.getID())] = actor
        cursor.execute("SELECT * FROM dead_actors WHERE person_id IN %s", (tuple(actors_by_id.keys()),))
        pastos = []
        for person in cursor.fetchall():
            person_id = person['person_id']
            character = str(actors_by_id[person_id].currentRole)
            pastos.append({
                'person_id': person['person_id'],
                'birth': person['birth'],
                'death': person['death'],
                'character': character,
                'name': person['name']
            })
        pastos = sorted(pastos, key=lambda pasto: pasto['death'], reverse=True)
        resp = make_response(json.dumps(pastos))
        resp.headers['Content-Type'] = 'application/json'
        resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp


if __name__ == '__main__':
    @app.route('/static/js/<path:path>')
    def send_js(path):
        return send_from_directory('./static/js', path)


    @app.route('/static/css/<path:path>')
    def send_css(path):
        return send_from_directory('./static/css', path)


    @app.route('/static/images/<path:path>')
    def send_img(path):
        return send_from_directory('./static/images', path)


    @app.route('/dist/<path:path>')
    def send_dist(path):
        return send_from_directory('./dist', path)


    app.run()
