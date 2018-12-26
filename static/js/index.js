import React from "react";
import ReactDOM from "react-dom";
import App from "./App";

const hash = window.location.hash.substring(1);
let searchTitle, searchId;
if (hash !== "") {
  // Run the search with the data in the hash onload
  const searchParams = new URLSearchParams(hash);
  searchTitle = searchParams.get("title");
  searchId = searchParams.get("id");
}

ReactDOM.render(
  <App searchTitle={searchTitle} searchId={searchId} />,
  document.getElementById("container")
);
