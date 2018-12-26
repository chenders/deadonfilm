import React from "react";
import "react-bootstrap-typeahead/css/Typeahead.css";
import { AsyncTypeahead } from "react-bootstrap-typeahead";
import axios from "axios";

const SEARCH_URI = "/search/";

const CancelToken = axios.CancelToken;
let source;

class TitleSearchInput extends React.Component {
  state = {
    options: [],
    allowNew: false,
    multiple: false
  };

  setInput = ref => {
    this.inputEl = ref;
  };

  render() {
    const { isSearching, initialValue } = this.props;
    return (
      <AsyncTypeahead
        {...this.state}
        delay={800}
        ref={this.setInput}
        autoFocus={!initialValue}
        isLoading={isSearching}
        onChange={this._handleSelected}
        id="movie-name"
        flip={true}
        labelKey="value"
        defaultInputValue={initialValue}
        placeholder="Movie name"
        bsSize="large"
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
    const newHash = new URLSearchParams();
    const selectedResult = selected[0];
    newHash.append("id", selectedResult.id);
    newHash.append("title", selectedResult.value);
    window.location.hash = newHash.toString();
    this.inputEl.getInstance().blur();
    onResults(selectedResult);
  };

  _handleSearch = query => {
    const { onSearching } = this.props;
    onSearching(true);
    if (source) {
      source.cancel("Cancelling");
    }
    source = CancelToken.source();
    axios
      .get(`${SEARCH_URI}?q=${query}`, {
        cancelToken: source.token
      })
      .then(resp => {
        this.setState(
          {
            options: resp.data
          },
          () => onSearching(false)
        );
      })
      .catch(function(thrown) {
        if (axios.isCancel(thrown)) {
          console.log("Request canceled", thrown.message);
        } else {
          // handle error
        }
      });
  };
}

export default TitleSearchInput;
