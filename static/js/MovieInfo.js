import React from "react";

const EveryonesAlive = () => {
  return (
    <div className="row dead-row">
      <div className="col-sm-offset-3 col-sm-6">
        Everyone&apos;s still alive!
      </div>
    </div>
  );
};

export const ElementWithData = props => {
  const { birth, death } = props;
  let title = "";
  if (birth && death) {
    const age = Number(death) - Number(birth);
    title = `${age} yrs (${birth} - ${death})`;
  }
  return (
    <div className="row dead-row">
      <div className="pasto col-sm-offset-3 col-sm-4">
        {props.name} <span>({props.character})</span>
      </div>
      <div className="died col-sm-2" title={title}>
        {props.death}
      </div>
    </div>
  );
};

class ResultElement extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      retrieved: false
    };

    fetch("/died/", {
      method: "POST",
      body: new URLSearchParams(`id=${props.id}`)
    })
      .then(resp => resp.json())
      .then(elements => {
        this.setState({
          retrieved: true,
          results: elements
        });
      });
  }

  render() {
    const { retrieved, results } = this.state;
    if (!retrieved) return null;
    if (results.length === 0) {
      return <EveryonesAlive />;
    } else {
      return (
        <React.Fragment>
          {results.map(elData => (
            <ElementWithData {...elData} />
          ))}
        </React.Fragment>
      );
    }
  }
}

export default ResultElement;
