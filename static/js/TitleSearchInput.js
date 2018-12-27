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

  setInputRef = ref => {
    this.inputEl = ref.getInstance();
  };

  render() {
    const { isSearching, initialValue } = this.props;
    return (
      <AsyncTypeahead
        {...this.state}
        clearButton
        flip
        autoFocus={!initialValue}
        allowNew={false}
        bsSize="large"
        defaultInputValue={initialValue}
        delay={800}
        id="movie-name"
        isLoading={isSearching}
        labelKey="value"
        multiple={false}
        onChange={this._handleSelected}
        onSearch={this._handleSearch}
        paginate={false}
        placeholder="Movie name"
        ref={this.setInputRef}
        renderMenuItemChildren={(option, props) => {
          return <div key={option.id}>{option.value}</div>;
        }}
      />
    );
  }

  _handleSelected = selected => {
    const { onResults } = this.props;
    if (!selected || selected.length === 0) {
      window.location.hash = "";
      onResults(null);
      this.inputEl.focus();
    } else {
      const newHash = new URLSearchParams();
      const selectedResult = selected[0];
      newHash.append("id", selectedResult.id);
      newHash.append("title", selectedResult.value);
      window.location.hash = newHash.toString();
      this.inputEl.blur();
      onResults(selectedResult);
    }
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
