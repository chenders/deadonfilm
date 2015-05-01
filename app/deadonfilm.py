import hashlib
import json
import logging
from logging.handlers import RotatingFileHandler

from flask import (
    Flask,
    make_response,
    request,
    send_from_directory,
    render_template
)
import imdb
from mx.DateTime import Parser
import psycopg2
import psycopg2.extras

app = Flask(__name__, template_folder='../templates/')

# We use the live imdb server for movie title search, because it's infinitely better.
i = imdb.IMDb()

conn = psycopg2.connect('dbname=imdb')
conn.autocommit = True
cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

@app.before_first_request
def setup_logging():
    logger = RotatingFileHandler('logs/deadonfilm.log', maxBytes=1000000, backupCount=2)
    formatter = logging.Formatter('%(asctime)s %(message)s', '%Y-%m-%d %H:%M:%S')
    logger.setFormatter(formatter)
    logger.setLevel(logging.DEBUG)
    app.logger.addHandler(logger)
    app.logger.setLevel(logging.DEBUG)

@app.route('/')
def index():
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
    Who died from the movie with IMDb long title of POST var ``title``?

    We use the local SQL database for this because it takes forever otherwise.
    """
    movie_title = request.form['title']
    app.logger.info('Who died in %s?' % movie_title)
    # We can look up the movie id in our database using a md5 hash of the title
    m = hashlib.md5(movie_title)
    cursor.execute("SELECT id FROM title WHERE md5sum = %s", (m.hexdigest(),))
    movie_id = cursor.fetchone()['id']
    # info_type_id = 23 is linked to "death date", so we are selecting character name, real name
    # from the local SQL db where a person has a "death date" entry.
    cursor.execute("SELECT \
                      char_name.name AS character, \
                      name.name, \
                      info as death_date, \
                      person_info.person_id \
                   FROM cast_info \
                      INNER JOIN char_name ON cast_info.person_role_id = char_name.id \
                      INNER JOIN person_info ON cast_info.person_id = person_info.person_id \
                      INNER JOIN name ON name.id = person_info.person_id \
                   WHERE \
                      movie_id = %s and person_info.info_type_id = 23", (movie_id,))
    pastos = {}
    for person in cursor.fetchall():
        pastos[str(person['person_id'])] = {
            'person_id': person['person_id'],
            'death': Parser.DateFromString(person['death_date']).strftime('%b %d, %Y'),
            'character': person['character'],
            'name': person['name']
        }
    resp = make_response(json.dumps(pastos))
    resp.headers['Content-Type'] = 'application/json'
    resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp

if __name__ == '__main__':
    @app.route('/static/js/<path:path>')
    def send_js(path):
        return send_from_directory('../static/js', path)

    @app.route('/static/css/<path:path>')
    def send_css(path):
        return send_from_directory('../static/css', path)
    
    @app.route('/static/images/<path:path>')
    def send_img(path):
        return send_from_directory('../static/images', path)
    
    app.run(host='0.0.0.0', debug=True)
