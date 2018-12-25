const engine = new Bloodhound({
  name: "movies",
  remote: "/search/?q=%QUERY",
  rateLimitWait: 800,
  datumTokenizer: Bloodhound.tokenizers.obj.whitespace("value"),
  queryTokenizer: Bloodhound.tokenizers.whitespace
});
engine.initialize();

let datum = {};
$(".typeahead")
  .typeahead(
    {
      hint: true,
      highlight: true,
      minLength: 1
    },
    {
      name: "movies",
      displayKey: "value",
      source: engine.ttAdapter()
    }
  )
  .on("typeahead:selected", function(obj, datum) {
    $(".dead-row").remove();
    $("#spinner").show();
    if (!datum.nohash) {
      window.location.hash = $.param({ title: datum.value, id: datum.id });
    }
    $.ajax({
      url: "/died/",
      type: "POST",
      data: { id: datum.id },
      complete: function() {
        $("#spinner").hide();
      },
      error: function(xhr) {
        $(".container").append(
          '<div class="row dead-row col-sm-offset-3 col-sm-4">' +
            (xhr.responseText == "Movie not found"
              ? "Movie not found! (??)"
              : "Error! :(") +
            "</div>"
        );
      },
      success: function(data) {
        let pastos = "";
        if (Object.keys(data).length > 0) {
          $.each(data, function(idx, el) {
            let death = el.birth
              ? "(" + el.birth + " - " + el.death + ")"
              : el.death;
            let title = "";
            if (el.birth) {
              title =
                death + " - " + (Number(el.death) - Number(el.birth)) + "yrs";
            }
            pastos +=
              '<div class="row dead-row">' +
              '<div class="pasto col-sm-offset-3 col-sm-4">' +
              el.name +
              " <span>(" +
              el.character +
              ")</span></div>" +
              '<div class="died col-sm-2" title="' +
              title +
              '">' +
              el.death +
              "</div>" +
              "</div>";
          });
        } else {
          pastos =
            '<div class="row dead-row"><div class="col-sm-offset-3 col-sm-6">Everyone\'s still alive!</div></div>';
        }
        $(".container").append(pastos);
      }
    });
  });
$(document).ready(function() {
  const hash = window.location.hash.substring(1);
  if (hash != "") {
    // Run the search with the data in the hash onload
    datum = deparam(hash);
    datum.value = datum.title;
    datum.id = datum.id;
    datum.nohash = true;
    $("#movie-name")
      .typeahead("val", datum.title)
      .trigger("typeahead:selected", [datum]);
  }
  // IE9 and below do not have native support. :(
  if ($.fn.placeholder) {
    $("input").placeholder();
  }
  $("#movie-name").on("keyup keydown change focus search mousedown", function(
    e
  ) {
    if ($(this).val() == "") {
      $(".dead-row").remove();
    }
  });
  $("input.typeahead").focus();
});
