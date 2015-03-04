var engine = new Bloodhound({
    name: 'movies',
    remote: '/search/?q=%QUERY',
    rateLimitWait: 800,
    datumTokenizer: Bloodhound.tokenizers.obj.whitespace('value'),
    queryTokenizer: Bloodhound.tokenizers.whitespace
});
engine.initialize()

$('.typeahead').typeahead({
        hint: true,
        highlight: true,
        minLength: 1
    },
    {
        name: 'movies',
        displayKey: 'value',
        source: engine.ttAdapter()
    }
).on('typeahead:opened', function (obj, datum) {
    $('.dead-row').remove();
}).on('typeahead:selected', function(obj, datum) {
    $('.dead-row').remove();
    $('#spinner').show();
    $.ajax({
        url: '/died/' + datum.id,
        type: 'GET',
        error: function() {
            $('#dead-row').html('<div class="row">Error! :(</div>');
        },
        success: function(data) {
            $('#spinner').hide();
            if (Object.keys(data).length > 0) {
                var pastos = '';
                $.each(data, function (idx, el) {
                    pastos += '<div class="row dead-row">' +
                    '<div class="pasto col-sm-offset-3 col-sm-4">' + el.name + ' <span>(' + el.character + ')</span></div>' +
                    '<div class="died col-sm-2">' + el.death + '</div>' +
                    '</div>';
                })
            } else {
                pastos = '<div class="row dead-row"><div class="col-sm-offset-3 col-sm-6">Everyone\'s still alive!</div></div>';
            }
            $('.container').append(pastos);
        }
    });
});
$(document).ready(function () {
    // IE9 and below do not have native support. :(
    if ($.fn.placeholder) {
        $('input').placeholder();
    }
    $('input.typeahead').focus();
});
