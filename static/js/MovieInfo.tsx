import React from "react";
import axios from "axios";
import Person from "./Person";
import { DeadPeopleProps, DeadPeopleState } from "./constants";

const EveryonesAlive = () => {
  return (
    <div className="row dead-row">
      <div className="col-sm-offset-3 col-sm-6">Everyone&apos;s still alive!</div>
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
    params.append("id", this.props.id);
    axios.post("/died/", params).then((elements) => {
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
    if (results.length === 0) {
      return <EveryonesAlive />;
    }
    return (
      <>
        {results.map((elData) => (
          <Person {...elData} />
        ))}
      </>
    );
  }
}

export default DeadPeople;
