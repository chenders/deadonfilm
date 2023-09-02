import React from "react";

interface PersonProps {
  birth: string;
  death: string;
  person_id: string;
  name: string;
  character: string;
}

const Person = (props: PersonProps) => {
  const { birth, death } = props;
  let title = "";
  if (birth && death) {
    const age = Number(death) - Number(birth);
    title = `${age} yrs (${birth} - ${death})`;
  }
  return (
    <div className="row dead-row" key={props.person_id}>
      <div className="pasto col-sm-offset-3 col-sm-4">
        {props.name} <span>({props.character})</span>
      </div>
      <div className="died col-sm-2" title={title}>
        {props.death}
      </div>
    </div>
  );
};

export default Person;
