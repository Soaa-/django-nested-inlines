/**
 * Django admin inlines
 *
 * Based on jQuery Formset 1.1
 * @author Stanislaus Madueke (stan DOT madueke AT gmail DOT com)
 * @requires jQuery 1.2.6 or later
 *
 * Copyright (c) 2009, Stanislaus Madueke
 * All rights reserved.
 *
 * Spiced up with Code from Zain Memon's GSoC project 2009
 * and modified for Django by Jannis Leidel, Travis Swicegood and Julien Phalip.
 *
 * Licensed under the New BSD License
 * See: http://www.opensource.org/licenses/bsd-license.php
 */
(function($) {
	$.fn.formset = function(opts) {
		var options = $.extend({}, $.fn.formset.defaults, opts);
		var $this = $(this);
		var $parent = $this.parent();
		var nextIndex = get_no_forms(options.prefix);
		
		//store the options. This is needed for nested inlines, to recreate the same form
		var group = $this.closest('.inline-group');
		group.data('django_formset', options);

		// Add form classes for dynamic behaviour
		$this.each(function(i) {
			$(this).not("." + options.emptyCssClass).addClass(options.formCssClass);
		});
		
		if (isAddButtonVisible(options)) {
			var addButton;
			if ($this.attr("tagName") == "TR") {
				// If forms are laid out as table rows, insert the
				// "add" button in a new table row:
				var numCols = this.eq(-1).children().length;
				$parent.append('<tr class="' + options.addCssClass + '"><td colspan="' + numCols + '"><a href="javascript:void(0)">' + options.addText + "</a></tr>");
				addButton = $parent.find("tr:last a");
			} else {
				// Otherwise, insert it immediately after the last form:
				$this.filter(":last").after('<div class="' + options.addCssClass + '"><a href="javascript:void(0)">' + options.addText + "</a></div>");
				addButton = $this.filter(":last").next().find("a");
			}
			addButton.click(function(e) {
				e.preventDefault();
				addRow(options);
			});
		}
		return this;
	};

	/* Setup plugin defaults */
	$.fn.formset.defaults = {
		prefix : "form", // The form prefix for your django formset
		addText : "add another", // Text for the add link
		deleteText : "remove", // Text for the delete link
		addCssClass : "add-row", // CSS class applied to the add link
		deleteCssClass : "delete-row", // CSS class applied to the delete link
		emptyCssClass : "empty-row", // CSS class applied to the empty row
		formCssClass : "dynamic-form", // CSS class applied to each form in a formset
		added : null, // Function called each time a new form is added
		removed : null // Function called each time a form is deleted
	};
	
	// Tabular inlines ---------------------------------------------------------
	$.fn.tabularFormset = function(options) {
		var $rows = $(this);
		var alternatingRows = function(row) {
			row_number = 0;
			$($rows.selector).not(".add-row").removeClass("row1 row2").each(function() {
				$(this).addClass('row' + ((row_number%2)+1));
				next = $(this).next();
				while (next.hasClass('nested-inline-row')) {
					next.addClass('row' + ((row_number%2)+1));
					next = next.next();
				}
				row_number = row_number + 1;
			});
		};

		var reinitDateTimeShortCuts = function() {
			// Reinitialize the calendar and clock widgets by force
			if ( typeof DateTimeShortcuts != "undefined") {
				$(".datetimeshortcuts").remove();
				DateTimeShortcuts.init();
			}
		};

		var updateSelectFilter = function() {
			// If any SelectFilter widgets are a part of the new form,
			// instantiate a new SelectFilter instance for it.
			if ( typeof SelectFilter != 'undefined') {
				$('.selectfilter').each(function(index, value) {
					var namearr = value.name.split('-');
					SelectFilter.init(value.id, namearr[namearr.length - 1], false, options.adminStaticPrefix);
				});
				$('.selectfilterstacked').each(function(index, value) {
					var namearr = value.name.split('-');
					SelectFilter.init(value.id, namearr[namearr.length - 1], true, options.adminStaticPrefix);
				});
			}
		};

		var initPrepopulatedFields = function(row) {
			row.find('.prepopulated_field').each(function() {
				var field = $(this), input = field.find('input, select, textarea'), dependency_list = input.data('dependency_list') || [], dependencies = [];
				$.each(dependency_list, function(i, field_name) {
					dependencies.push('#' + row.find('.field-' + field_name).find('input, select, textarea').attr('id'));
				});
				if (dependencies.length) {
					input.prepopulate(dependencies, input.attr('maxlength'));
				}
			});
		};

		$rows.formset({
			prefix : options.prefix,
			addText : options.addText,
			formCssClass : "dynamic-" + options.prefix,
			deleteCssClass : "inline-deletelink",
			deleteText : options.deleteText,
			emptyCssClass : "empty-form",
			removed : function(row) {
				alternatingRows(row);
				if(options.removed) options.removed(row);
			},
			added : function(row) {
				initPrepopulatedFields(row);
				reinitDateTimeShortCuts();
				updateSelectFilter();
				alternatingRows(row);
				if(options.added) options.added(row);
			}
		});

		return $rows;
	};

	// Stacked inlines ---------------------------------------------------------
	$.fn.stackedFormset = function(options) {
		var $rows = $(this);

		var update_inline_labels = function(formset_to_update) {
			formset_to_update.children('.inline-related').not('.empty-form').children('h3').find('.inline_label').each(function(i) {
				var count = i + 1;
				$(this).html($(this).html().replace(/(#\d+)/g, "#" + count));
			});
		};

		var reinitDateTimeShortCuts = function() {
			// Reinitialize the calendar and clock widgets by force, yuck.
			if ( typeof DateTimeShortcuts != "undefined") {
				$(".datetimeshortcuts").remove();
				DateTimeShortcuts.init();
			}
		};

		var updateSelectFilter = function() {
			// If any SelectFilter widgets were added, instantiate a new instance.
			if ( typeof SelectFilter != "undefined") {
				$(".selectfilter").each(function(index, value) {
					var namearr = value.name.split('-');
					SelectFilter.init(value.id, namearr[namearr.length - 1], false, options.adminStaticPrefix);
				});
				$(".selectfilterstacked").each(function(index, value) {
					var namearr = value.name.split('-');
					SelectFilter.init(value.id, namearr[namearr.length - 1], true, options.adminStaticPrefix);
				});
			}
		};

		var initPrepopulatedFields = function(row) {
			row.find('.prepopulated_field').each(function() {
				var field = $(this), input = field.find('input, select, textarea'), dependency_list = input.data('dependency_list') || [], dependencies = [];
				$.each(dependency_list, function(i, field_name) {
					dependencies.push('#' + row.find('.form-row .field-' + field_name).find('input, select, textarea').attr('id'));
				});
				if (dependencies.length) {
					input.prepopulate(dependencies, input.attr('maxlength'));
				}
			});
		};

		$rows.formset({
			prefix : options.prefix,
			addText : options.addText,
			formCssClass : "dynamic-" + options.prefix,
			deleteCssClass : "inline-deletelink",
			deleteText : options.deleteText,
			emptyCssClass : "empty-form",
			removed : function(row) {
				update_inline_labels(row);
				if(options.removed) options.removed(row);
			},
			added : (function(row) {
				initPrepopulatedFields(row);
				reinitDateTimeShortCuts();
				updateSelectFilter();
				update_inline_labels(row.parent());
				if(options.added) options.added(row);
			})
		});

		return $rows;
	};

	function create_nested_formsets(parentPrefix, rowId) {
		// we use the first formset as template. so replace every index by 0
		var sourceParentPrefix = parentPrefix.replace(/[-][0-9][-]/g, "-0-");
		
		var row_prefix = parentPrefix+'-'+rowId;
		var row = $('#'+row_prefix);
		
		// Check if the form should have nested formsets
		// This is horribly hackish. It tries to collect one set of nested inlines from already existing rows and clone these
		var search_space = $("#"+sourceParentPrefix+'-0').nextUntil("."+sourceParentPrefix + "-not-nested");
		
		//all nested inlines
		var nested_inlines = search_space.find("." + sourceParentPrefix + "-nested-inline");
		nested_inlines.each(function(index) {
			// prefixes for the nested formset
			var normalized_formset_prefix = $(this).attr('id').split('-group')[0];
			// = "parent_formset_prefix"-0-"nested_inline_name"_set
			var formset_prefix = normalized_formset_prefix.replace(sourceParentPrefix + "-0", row_prefix);
			// = "parent_formset_prefix"-"next_form_id"-"nested_inline_name"_set
			// Find the normalized formset and clone it
			var template = $(this).clone();
			
			//get the options that were used to create the source formset
			var options = $(this).data('django_formset');
			//clone, so that we don't modify the old one
			options = $.extend({}, options);
			options.prefix = formset_prefix;
			
			var isTabular = template.find('#'+normalized_formset_prefix+'-empty').is('tr');
			
			//remove all existing rows from the clone
			if (isTabular) {
				//tabular
				template.find(".form-row").not(".empty-form").remove();
				template.find(".nested-inline-row").remove();
			} else {
				//stacked cleanup
				template.find(".inline-related").not(".empty-form").remove();
			}
			//remove other unnecessary things
			template.find('.'+options.addCssClass).remove();
			
			//replace the cloned prefix with the new one
			update_props(template, normalized_formset_prefix, formset_prefix);
			//reset update formset management variables
			template.find('#id_' + formset_prefix + '-INITIAL_FORMS').val(0);
			template.find('#id_' + formset_prefix + '-TOTAL_FORMS').val(1);
			//remove the fk and id values, because these don't exist yet
			template.find('.original').empty();
			
			

			//postprocess stacked/tabular
			if (isTabular) {
				var formset = template.find('.tabular.inline-related tbody tr.' + formset_prefix + '-not-nested').tabularFormset(options);
				var border_class = (index+1 < nested_inlines.length) ? ' no-bottom-border' : '';
				var wrapped = $('<tr class="nested-inline-row' + border_class + '"/>').html($('<td colspan="100%"/>').html(template));
				//insert the formset after the row
				row.after(wrapped);
			} else {
				var formset = template.find(".inline-related").stackedFormset(options);
				
				row.after(template);
			}
			
			//add a empty row. This will in turn create the nested formsets
			addRow(options);
		});
		
		return nested_inlines.length;
	};
	

	function update_props(template, normalized_formset_prefix, formset_prefix) {
		// Fix template id
		template.attr('id', template.attr('id').replace(normalized_formset_prefix, formset_prefix));
		template.find('*').each(function() {
			if ($(this).attr("for")) {
				$(this).attr("for", $(this).attr("for").replace(normalized_formset_prefix, formset_prefix));
			}
			if ($(this).attr("class")) {
				$(this).attr("class", $(this).attr("class").replace(normalized_formset_prefix, formset_prefix));
			}
			if (this.id) {
				this.id = this.id.replace(normalized_formset_prefix, formset_prefix);
			}
			if (this.name) {
				this.name = this.name.replace(normalized_formset_prefix, formset_prefix);
			}
		});
		
	};

	// This returns the amount of forms in the given formset
	function get_no_forms(formset_prefix) {
		formset_prop = $("#id_" + formset_prefix + "-TOTAL_FORMS")
		if (!formset_prop.length) {
			return 0;
		}
		return parseInt(formset_prop.attr("autocomplete", "off").val());
	}

	function change_no_forms(formset_prefix, increase) {
		var no_forms = get_no_forms(formset_prefix);
		if (increase) {
			$("#id_" + formset_prefix + "-TOTAL_FORMS").attr("autocomplete", "off").val(parseInt(no_forms) + 1);
		} else {
			$("#id_" + formset_prefix + "-TOTAL_FORMS").attr("autocomplete", "off").val(parseInt(no_forms) - 1);
		}
	};

	// This return the maximum amount of forms in the given formset
	function get_max_forms(formset_prefix) {
		var max_forms = $("#id_" + formset_prefix + "-MAX_NUM_FORMS").attr("autocomplete", "off").val();
		if ( typeof max_forms == 'undefined' || max_forms == '') {
			return '';
		}
		return parseInt(max_forms);
	};
	
	function addRow(options) {
		var nextIndex = get_no_forms(options.prefix);
		
		var row = insertNewRow(options.prefix, options);

		updateAddButton(options.prefix);

		// Add delete button handler
		row.find("a." + options.deleteCssClass).click(function(e) {
			e.preventDefault();
			// Find the row that will be deleted by this button
			var row = $(this).parents("." + options.formCssClass);
			// Remove the parent form containing this button:
			var formset_to_update = row.parent();
			//remove nested inlines
			while (row.next().hasClass('nested-inline-row')) {
				row.next().remove();
			}
			row.remove();
			change_no_forms(options.prefix, false);
			// If a post-delete callback was provided, call it with the deleted form:
			if (options.removed) {
				options.removed(formset_to_update);
			}

		});
		
		var num_formsets = create_nested_formsets(options.prefix, nextIndex);
		if(row.is("tr") && num_formsets > 0) {
			row.addClass("no-bottom-border");
		}

		// If a post-add callback was supplied, call it with the added form:
		if (options.added) {
			options.added(row);
		}

		nextIndex = nextIndex + 1;
	};
	
	function insertNewRow(prefix, options) {
		var template = $("#" + prefix + "-empty");
		var nextIndex = get_no_forms(prefix);
		var row = prepareRowTemplate(template, prefix, nextIndex, options);
		// when adding something from a cloned formset the id is the same

		// Insert the new form when it has been fully edited
		row.insertBefore($(template));

		// Update number of total forms
		change_no_forms(prefix, true);
		
		return row;
	};
	
	function prepareRowTemplate(template, prefix, index, options) {
		var row = template.clone(true);
		row.removeClass(options.emptyCssClass).addClass(options.formCssClass).attr("id", prefix + "-" + index);
		if (row.is("tr")) {
			// If the forms are laid out in table rows, insert
			// the remove button into the last table cell:
			row.children(":last").append('<div><a class="' + options.deleteCssClass + '" href="javascript:void(0)">' + options.deleteText + "</a></div>");
		} else if (row.is("ul") || row.is("ol")) {
			// If they're laid out as an ordered/unordered list,
			// insert an <li> after the last list item:
			row.append('<li><a class="' + options.deleteCssClass + '" href="javascript:void(0)">' + options.deleteText + "</a></li>");
		} else {
			// Otherwise, just insert the remove button as the
			// last child element of the form's container:
			row.children(":first").append('<span><a class="' + options.deleteCssClass + '" href="javascript:void(0)">' + options.deleteText + "</a></span>");
		}
		row.find("*").each(function() {
			updateElementIndex(this, prefix, index);
		});
		return row;
	};
	
	function updateElementIndex(el, prefix, ndx) {
		var id_regex = new RegExp("(" + prefix + "-(\\d+|__prefix__))");
		var replacement = prefix + "-" + ndx;
		if ($(el).attr("for")) {
			$(el).attr("for", $(el).attr("for").replace(id_regex, replacement));
		}
		if (el.id) {
			el.id = el.id.replace(id_regex, replacement);
		}
		if (el.name) {
			el.name = el.name.replace(id_regex, replacement);
		}
	};
	
	/** show or hide the addButton **/
	function updateAddButton(options) {
		// Hide add button in case we've hit the max, except we want to add infinitely
		var btn = $("#" + options.prefix + "-empty").parent().children('.'+options.addCssClass);
		if (isAddButtonVisible(options)) {
			btn.hide();
		} else {
			btn.show();
		}
	}
	
	function isAddButtonVisible(options) {
		return !(get_max_forms(options.prefix) !== '' && (get_max_forms(options.prefix) - get_no_forms(options.prefix)) <= 0);
	}
})(django.jQuery);

// TODO:
// Remove border between tabular fieldset and nested inline
// Fix alternating rows