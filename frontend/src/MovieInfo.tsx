import React from "react";
import axios from "axios";
import Person from "./Person";
import { DeadPeopleProps, DeadPeopleState } from "./constants";

export const ErrorMessage: React.FC<{}> = ({ children }) => {
  return (
    <div className="row dead-row">
      <div className="col-sm-offset-3 col-sm-6">{children}</div>
    </div>
  );
};

class DeadPeople extends React.Component<DeadPeopleProps, DeadPeopleState> {
  constructor(props) {
    super(props);
    this.state = {
      retrieved: false,
      results: null,
    };
  }

  componentDidMount() {
    const params = new URLSearchParams();
    params.append("movie_id", this.props.id);
    axios.get(`http://localhost:8000/died/?${params.toString()}`).then((elements) => {
      this.setState({
        retrieved: true,
        results: elements.data,
      });
    });
  }

  render() {
    const { retrieved, results } = this.state;
    if (!retrieved) {
      return (
        <div className="row spinner">
          <div className="col-sm-offset-3 col-sm-8">
            <div id="spinner" />
          </div>
        </div>
      );
    }

    if ("error" in results) {
      return <ErrorMessage>{results.error}</ErrorMessage>;
    }

    if (results.length === 0) {
      return <ErrorMessage>Everyone&apos;s still alive!</ErrorMessage>;
    }

    return (
      <>
        {results.map((elData) => (
          <Person key={elData.person_id} {...elData} />
        ))}
      </>
    );
  }
}

export default DeadPeople;
