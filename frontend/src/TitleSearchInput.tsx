import React from "react";
import "react-bootstrap-typeahead/css/Typeahead.css";
import { AsyncTypeahead } from "react-bootstrap-typeahead";
import axios from "axios";

const SEARCH_URI = "http://localhost:8000/search/";

const { CancelToken } = axios;
let source;

interface Props {
  isSearching: boolean;
  initialValue: string;
  onResults: Function;
  onSearching: Function;
}

interface State {
  options: any;
  allowNew: boolean;
  multiple: boolean;
}

class TitleSearchInput extends React.Component<Props, State> {
  inputEl = React.createRef<HTMLInputElement>();

  constructor(props) {
    super(props);
    this.state = {
      options: [],
      allowNew: false,
      multiple: false,
    };
  }

  handleSelected = (selected) => {
    const { onResults } = this.props;
    if (!selected || selected.length === 0) {
      window.location.hash = "";
      onResults(null);
      this.inputEl.current?.focus();
    } else {
      const newHash = new URLSearchParams();
      const selectedResult = selected[0];
      newHash.append("id", selectedResult.id);
      newHash.append("title", selectedResult.value);
      window.location.hash = newHash.toString();
      this.inputEl.current?.blur();
      onResults(selectedResult);
    }
  };

  handleSearch = (query) => {
    const { onSearching } = this.props;
    onSearching(true);
    if (source) {
      source.cancel("Cancelling");
    }
    source = CancelToken.source();
    axios
      .get(`${SEARCH_URI}?movie_title=${query}`, {
        cancelToken: source.token,
      })
      .then((resp) => {
        this.setState(
          {
            options: resp.data,
          },
          () => onSearching(false)
        );
      })
      .catch((thrown) => {
        if (axios.isCancel(thrown)) {
          // eslint-disable-next-line no-console
          console.log("Request canceled", thrown.message);
        } else {
          // handle error
        }
      });
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
        size="large"
        defaultInputValue={initialValue}
        delay={800}
        id="movie-name"
        isLoading={isSearching}
        labelKey="value"
        multiple={false}
        onChange={this.handleSelected}
        onSearch={this.handleSearch}
        paginate={false}
        placeholder="Movie name"
        ref={this.inputEl}
        renderMenuItemChildren={(option) => {
          return <div key={option.id}>{option.value}</div>;
        }}
      />
    );
  }
}

export default TitleSearchInput;
