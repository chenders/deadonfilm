import React from "react";
import "react-bootstrap-typeahead/css/Typeahead.css";
import { AsyncTypeahead } from "react-bootstrap-typeahead";

const SEARCH_URI = "/search/";

class TitleSearchInput extends React.Component {
  state = {
    options: [],
    allowNew: false,
    multiple: false
  };

  render() {
    const { isSearching } = this.props;
    return (
      <AsyncTypeahead
        {...this.state}
        autoFocus
        isLoading={isSearching}
        onChange={this._handleSelected}
        id="movie-name"
        labelKey="value"
        placeholder="Movie name"
        minLength={2}
        onSearch={this._handleSearch}
        renderMenuItemChildren={(option, props) => {
          return <div key={option.id}>{option.value}</div>;
        }}
      />
    );
  }

  _handleSelected = selected => {
    const { onResults } = this.props;
    onResults(selected[0]);
  };

  _handleSearch = query => {
    const { onSearching } = this.props;
    onSearching(true);
    fetch(`${SEARCH_URI}?q=${query}`)
      .then(resp => resp.json())
      .then(el => {
        return el;
      })
      .then(resp => {
        this.setState(
          {
            options: resp
          },
          () => onSearching(false)
        );
      });
  };
}

export default TitleSearchInput;
