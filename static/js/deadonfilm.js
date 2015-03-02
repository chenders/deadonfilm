$(window).resize(function () {
    $('.vertical-center').css({
        display: 'block',
        position: 'absolute',
        top: ($(window).height() - $('.vertical-center').outerHeight()) / 3
    });
    $('#dead-row').css({width: $('.input-group').width()});

});

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
    $('.pasto-row').remove();
}).on('typeahead:selected', function(obj, datum) {
    $('.pasto-row').remove();
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
                    pastos += '<div class="row pasto-row">' +
                    '<div class="pasto col-md-8">' + el.name + ' <span>(' + el.character + ')</span></div>' +
                    '<div class="died col-md-4">' + el.death + '</div>' +
                    '</div>';
                })
            } else {
                pastos = '<div class="row"><div class="col-md-8">Everyone\'s still alive!</div></div>';
            }
            $('#dead-row').html(pastos);
        }
    });
});
setTimeout(function () {
    $(window).resize();
}, 500);