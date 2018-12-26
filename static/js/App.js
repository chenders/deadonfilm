import React from "react";
import TitleSearchInput from "./TitleSearchInput";
import MovieInfo from "./MovieInfo";

import "../css/deadonfilm.css";

class App extends React.Component {
  state = {
    results: null,
    isSearching: false,
    hasSearched: false
  };

  constructor(props) {
    super(props);
    if (props.searchTitle && props.searchId) {
      this.state.hasSearched = true;
      this.state.results = {
        id: props.searchId,
        title: props.searchTitle
      };
    }
  }
  _onResults = results => {
    this.setState({ results: results });
  };

  _onSearching = isSearching => {
    let data = {
      isSearching
    };
    if (isSearching) {
      data.results = null;
    }
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
                initialValue={this.props.searchTitle}
              />
            </div>
          </div>
        </div>
        <div id="pastos-info">
          {hasSearched && !isSearching && results && (
            <MovieInfo key={results.id} {...results} />
          )}
        </div>
      </React.Fragment>
    );
  }
}

export default App;
