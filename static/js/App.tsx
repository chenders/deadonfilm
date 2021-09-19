import React from "react";
import TitleSearchInput from "./TitleSearchInput";
import MovieInfo from "./MovieInfo";

import "../css/deadonfilm.css";

interface Props {
  searchTitle?: string;
  searchId?: string;
}
interface State {
  hasSearched?: boolean;
  isSearching?: boolean;
  results?: { id: string; title: string };
}
class App extends React.Component<Props, State> {
  constructor(props) {
    super(props);
    const state = {
      results: null,
      isSearching: false,
      hasSearched: false,
    };

    const { searchTitle, searchId } = this.props;
    if (searchTitle && searchId) {
      state.hasSearched = true;
      state.results = {
        id: searchId,
        title: searchTitle,
      };
    }
    this.state = state;
  }

  render() {
    const { results, hasSearched, isSearching } = this.state;
    return (
      <>
        <a href="/">
          <img alt="skull" id="skull" src="/static/images/skull.png" />
        </a>
        <h1 id="sitename">Dead on Film</h1>
        <div id="footer">Last updated: December 24th, 2018</div>
        <div className="row movie-input">
          <div className="col-sm-12">
            <div className="col-sm-offset-3 col-sm-6" id="movie-name">
              <TitleSearchInput
                isSearching={isSearching}
                onSearching={(_isSearching) =>
                  this.setState((state) => {
                    return {
                      isSearching: _isSearching,
                      results: null,
                      hasSearched: Boolean(state.hasSearched),
                    };
                  })
                }
                onResults={(_results) => this.setState({ results: _results })}
                initialValue={this.props.searchTitle}
              />
            </div>
          </div>
        </div>
        <div id="pastos-info">
          {hasSearched && !isSearching && results && <MovieInfo key={results.id} {...results} />}
        </div>
      </>
    );
  }
}

export default App;
