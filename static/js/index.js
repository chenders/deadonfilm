import React from "react";
import ReactDOM from "react-dom";
import TitleSearchInput from "./TitleSearchInput";
import MovieInfo from "./MovieInfo";

import "../css/deadonfilm.css";

class App extends React.Component {
  state = {
    results: [],
    isSearching: false,
    hasSearched: false
  };

  _onResults = results => {
    this.setState({ results: results });
  };

  _onSearching = isSearching => {
    let data = {
      isSearching
    };
    if (!this.state.hasSearched) {
      data.hasSearched = true;
    }
    this.setState(data);
  };

  render() {
    const { results, hasSearched, isSearching } = this.state;
    return (
      <React.Fragment>
        <a href="/">
          <img id="skull" src="/static/images/skull.png" />
        </a>
        <h1 id="sitename">Dead on Film</h1>
        <div id="footer">Last updated: December 24th, 2018</div>
        <div className="row movie-input">
          <div className="col-sm-12">
            <div className="col-sm-offset-3 col-sm-6" id="movie-name">
              <TitleSearchInput
                isSearching={isSearching}
                onSearching={this._onSearching}
                onResults={this._onResults}
              />
            </div>
          </div>
        </div>
        <div id="pastos-info">
          {hasSearched && !isSearching && results.id && (
            <MovieInfo key={results.id} {...results} />
          )}
        </div>
      </React.Fragment>
    );
  }
}

ReactDOM.render(<App />, document.getElementById("container"));
