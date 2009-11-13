(function () {

var blank_iframe = '/index-blank.html';
var example_jquery = 'http://ajax.googleapis.com/ajax/libs/jquery/1.2.6/jquery.min.js'; // latest from google

var re_opt = /options/i;

if (!window.jquerydocs) window.jquerydocs = {};
if (!window.xmldoc) window.xmldoc = null;

window.loadDocs = function(data) {
    $(document).trigger('api-loading');
    
    if (!xmldoc && typeof data != "undefined") {
        jquerydocs = data;
        attachFind(jquerydocs);
        $(document).trigger('api-load-success');
        $(document).trigger('api-load-complete');
    } else {
        // parser
        $.ajax({
            url: xmldoc || 'jquery-docs.xml', // generated from jquery source: /tools/wikiapi2xml/createjQueryXMLDocs.py
            dataType: 'xml',
            success: parse,
            error: function () {
                $(document).trigger('api-load-error');
            },
            complete: function () {
                $(document).trigger('api-load-complete');
            }
        });
    }
};

function parse(xml) {
    var docinfo = $('docs', xml);
    var guid = 0; // TODO upgrade guid to a combo of fn name and params - like Jorn's browser

    jquerydocs.version = docinfo.attr('version');
    jquerydocs.timestamp = docinfo.attr('timestamp');
    jquerydocs.startdoc = docinfo.attr('startdoc');
    
    var letters = []; // holder before sorting and inserting
    jquerydocs.letters = [];

    jquerydocs.data = {};
    jquerydocs.searchNames = [];
    jquerydocs.categories = [];

    // loop through all types collecting data
    $('cat', xml).each(function (i) {
        var catName = this.getAttribute('value');
        var category = {};
        category.name = catName;
        category.subcategories = [];
        
        $('subcat', this).each(function (i) {
            var subcatName = this.getAttribute('value');
            category.subcategories.push(subcatName);
            
            $('function,property,selector', this).each(function () {
                var data = {};
                guid++;
                
                // some function names have spaces around them - so trim
                var name = this.getAttribute('name').replace( /^\s+|\s+$/g, '');
                
                var searchName = name.toLowerCase().replace(/^jquery\./, '');
                letters.push(name.toLowerCase().substr(0,1));

                name = name.replace(/^jquery\./i, '$.');
                
                jquerydocs.searchNames.push(searchName + guid);
                
                data['id'] = guid;
                data['searchname'] = searchName;
                data['name'] = name;
                data['type'] = this.nodeName.toLowerCase();
                data['category'] = this.getAttribute('cat');
                data['subcategory'] = subcatName;
                data['return'] = escapeHTML(this.getAttribute('return'));
                data['added'] = $('added', this).text();
                data['sample'] = $('> sample', this).text();
                data['desc'] = $('> desc', this).text();
                data['longdesc'] = deWikify($('> longdesc', this).text());
                
                // silly hack because of conversion issue from wiki to text (the .ready function 
                // has HTML in the description), but also includes HTML that should be printed, 
                // in particular the body tag :-(
                data.longdesc = data.longdesc.replace(/<body>/, '&lt;body&gt;');
                
                // some descs are in HTML format, some aren't
                if (!(/<p>/).test(data.longdesc)) {
                    data.longdesc = '<p>' + data.longdesc.split(/\n\n/).join('</p><p>') + '</p>';
                }

                // strip our empty p tag if there was no description
                if (data.longdesc == '<p></p>') {
                    data.longdesc = '';
                }
                
                /** params - we'll also search for Options to decide whether we need to parse */
                var readOptions = false;
                data.params = [];
                $('params', this).each(function (i) {
                    var type = escapeHTML(this.getAttribute('type'));
                    var name = this.getAttribute('name');
                    var opt = this.getAttribute('optional') || "";
                    var desc = $('desc', this).text();
                    
                    if (re_opt.test(type)) {
                        readOptions = true;
                    }
                    
                    data.params.push({
                        optional : (/true/i).test(opt), // bool
                        name : name,
                        type : type,
                        desc : desc
                    });
                });
                
                if (readOptions) {
                    data.options = [];
                    $('option', this).each(function () {
                        var option = {};
                        option['name'] = this.getAttribute('name');
                        option['default'] = this.getAttribute('default') || '';
                        option['type'] = escapeHTML(this.getAttribute('type'));
                        option['desc'] = deWikify($('desc', this).text());

                        data.options.push(option);
                    });
                }

                data.examples = [];
                /** examples */
                $('example', this).each(function (i) {
                    var iframe = '', exampleId = '';
                    var example = {};

                    example['code'] = $('code', this).text();
                    example['htmlCode'] = escapeHTML(example.code);
                    example['desc'] = deWikify(escapeHTML($('desc', this).text()));
                    example['css']  = $('css', this).text() || '';
                    example['inhead'] = $('inhead', this).text() || '';
                    example['html'] = $('html', this).text() || '';

                    exampleId = guid + 'iframeExample' + i;
                    example['exampleId'] = exampleId;
                    
                    if (example.html) {

                        iframe = '<iframe id="' + exampleId + '" class="example" src="' + blank_iframe + '"></iframe>';

                        // we're storing the example iframe source to insert in to 
                        // the iframe only once it's inserted in to the DOM.
                        example['runCode'] = iframeTemplate().replace(/%([a-z]*)%/ig, function (m, l) {
                            return example[l] || "";
                        });
                    } else {
                        example.runCode = '';
                    }

                    data.examples.push(example);
                });

                jquerydocs.data[searchName + data.id] = data;
            });
        });

        jquerydocs.categories.push(category); // FIXME should I warn if this exists?
    });

    jquerydocs.letters = unique($.map(letters.sort(), function (i) {
        return i.substr(0,1);
    }));
    
    // attachFind(jquerydocs);

    $(document).trigger('api-load-success');
}

// helpers

function attachFind(o) {
    o.find = function (s, by) {
        var found = [], 
            tmp = {}, 
            tmpNames = [], 
            lettersLK = {}, 
            letters = [],
            catsLK = {},
            cats = [],
            catPointer = 0,
            subLK = {},
            sub = [],
            data = {};
            
        var i = 0;
        s = s.toLowerCase();
        by = (by || 'searchname').toLowerCase();
        
        if (by == 'name') by = 'searchname'; // search without the $.
        
        for (i = 0; i < jquerydocs.searchNames.length; i++) {
            if (jquerydocs.data[jquerydocs.searchNames[i]][by] && jquerydocs.data[jquerydocs.searchNames[i]][by].toLowerCase().indexOf(s) == 0) {
                data = tmp[jquerydocs.searchNames[i]] = jquerydocs.data[jquerydocs.searchNames[i]];
                tmpNames.push(jquerydocs.searchNames[i]);
                
                if (!lettersLK[jquerydocs.searchNames[i].substr(0, 1)]) {
                    lettersLK[jquerydocs.searchNames[i].substr(0, 1)] = true;
                    letters.push(jquerydocs.searchNames[i].substr(0, 1));
                }
                
                if (typeof catsLK[data.category] == 'undefined') {
                    catsLK[data.category] = catPointer;
                    cats.push({ name : data.category, subcategories : [] });
                    catPointer++;
                }
                
                if (!subLK[data.subcategory]) {
                    subLK[data.subcategory] = true;
                    
                    cats[catsLK[data.category]].subcategories.push(data.subcategory);
                }
            }
        }
        
        tmpNames = tmpNames.sort().reverse(); // never sure if this is faster with the reverse
        i = tmpNames.length;
        while (i--) {
            found.push(tmp[tmpNames[i]]);
        }
        
        // this is kind of noddy, but returns the same object as we queried - which is cool!
        found.letters = letters;
        found.categories = cats;
        found.data = tmp;
        found.searchNames = tmpNames;
        attachFind(found);
        
        return found;
    };
}

function fieldMap() {
    return {
        
    }
}

function unique(a) {
    var ret = [], done = {};

	try {
		for ( var i = 0, length = a.length; i < length; i++ ) {
			var id = a[ i ] ;

			if ( !done[ id ] ) {
				done[ id ] = true;
				ret.push( a[ i ] );
			}
		}

	} catch( e ) {
		ret = a;
	}

	return ret;
}

function iframeTemplate() {
    // array so that we maintain some formatting
    return [
        '<!' + 'DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN"', 
        '    "http://www.w3.org/TR/html4/loose.dtd">', 
        '<' + 'html>', 
        '<' + 'head>', 
        '<base href="http://docs.jquery.com" />', 
        '<' + 'script src="' + example_jquery + '"><' + '/script>', 
        '%inhead%', 
        '<' + 'script>', 
        '$(document).ready(function(){', '%code%', '  });', 
        '<' + '/script>', 
        '<' + 'style>', 
        '%css%', 
        '<' + '/style>', 
        '<' + '/head>', 
        '<' + 'body>', 
        '%html%', 
        '<' + '/body>', 
        '<' + '/html>'
    ].join("\n");
}



/** public utility functions */

window.escapeHTML = function (s) {
    // converts null to string
    return (s+"").replace(/[<>]/g, function (m) {
        if (m == '<') return '&lt;';
        else if (m == '>') return '&gt;';
    });
};

window.cleanSelector = function(s) {
    return (s+"").replace(/[\$\.]/g, function (m) {
        // handle escaping characters that break the selector engine
        if (m == '$') {
            return '\\$';
        } else if (m == '.') {
            return '\\.';
        }
    });
};

window.linkifyTypes = function(type) {
    // cheeky way to avoid doing a massive if (m == x || m == y || m == etc) - we just do an .indexOf()
    var nodocs = '|jQuery|XMLHttpRequest|Plugins|Validator|Validation|undefined|or|Any|DOM|Map|top|left|lt|gt|\(s\)||'; // note we purposely include an empty match

    return type ? $.map(type.replace(/DOMElement/g, 'DOM Element').split(/, /), function (n) {
        // match words and linkify, then italic to the optionals
        return n.replace(/boolean/, 'Boolean').replace(/\b[a-z]*\b/gi, function (m, l) {
            // special case
            if (m == 'Elements') {
                return '<a href="http://docs.jquery.com/Types#Element">Element</a>s';
            // no specific documentation for these types
            } else if (nodocs.indexOf('|' + m + '|') !== -1) {
                return m;
            } else {
                return '<a href="http://docs.jquery.com/Types#' + m + '">' + m + '</a>';
            }
        });
    }).join(', ') : "";
};

window.deWikify = function (s) {
    return (""+s).replace(/'''.*?'''/g, function (m) {
        return '<strong>' + m.replace(/'''/g, '') + '</strong>';
    }).replace(/''.*?''/g, function (m) {
        return '<em>' + m.replace(/''/g, '') + '</em>';
    }).replace(/\[http.*?\]/, function (m) {
        var p = m.replace(/^\[/, '').replace(/\]$/, '').split(/ /);
        return '<a href="' + p[0] + '">' + (p.length == 2 ? p[1] : p[0]) + '</a>';
    }).replace(/(((^|\n)(\*|[0-9]+.).*)+)/g, function (m) {
        var type = 'ol';
        // strip leading new line
        m = m.replace( /^\s+|\s+$/g, "" );
        if (m.match(/^\*/)) type = 'ul';
        return '<' + type + '><li>' + m.replace(/\*?/g, '').split(/\n/).join("</li><li>") + '</li></' + type + '>';
    });
};

window.runExample = function(data) {
    if (!data.examples || data.examples.length == 0) return;
    
    var i, win, example;

    for (i = 0; i < data.examples.length; i++) {
        example = data.examples[i];
        
        win = $('#' + cleanSelector(example.exampleId)).get(0);
        if (win) {
            win = win.contentDocument || win.contentWindow.document;

            // from docs.jquery.com
            win.write(example.runCode.replace("$(document).ready(function(){", "window.onload = (function(){try{")
                .replace(/}\);\s*<\/sc/, "}catch(e){}});</sc")
                .replace("</head>", "<style>html,body{border:0; margin:0; padding:0;}</style></head>")
            );

            win.close();
        }
    }
};

window.fixLinks = function (context) {
    // since the source comes from the wiki, we need to adjust some of the links
    $('a', context).each(function () {
        var href = this.getAttribute('href');
        if (href && !href.match(/http/) && !href.match(/^#/) && this.className != 'fnName') {
            this.host = 'docs.jquery.com';
            this.pathname = this.pathname.replace(window.location.pathname, '');
        }
    });
};

})();