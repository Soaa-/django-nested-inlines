from django.contrib.admin.options import (ModelAdmin, InlineModelAdmin,
    csrf_protect_m, models, transaction, all_valid,
    PermissionDenied, unquote, escape, Http404, reverse)
# Fix to make Django 1.5 compatible, maintain backwards compatibility
try:
    from django.contrib.admin.options import force_unicode
except ImportError:
    from django.utils.encoding import force_unicode

from django.contrib.admin.helpers import InlineAdminFormSet, AdminForm
from django.utils.translation import ugettext as _

from forms import BaseNestedModelForm, BaseNestedInlineFormSet
from helpers import AdminErrorList

class NestedModelAdmin(ModelAdmin):
    class Media:
        css = {'all': ('admin/css/nested.css',)}
        js = ('admin/js/nested.js',)
        
    def get_form(self, request, obj=None, **kwargs):
        return super(NestedModelAdmin, self).get_form(
            request, obj, form=BaseNestedModelForm, **kwargs)
        
    def get_inline_instances(self, request, obj=None):
        inline_instances = []
        for inline_class in self.inlines:
            inline = inline_class(self.model, self.admin_site)
            if request:
                if not (inline.has_add_permission(request) or
                        inline.has_change_permission(request, obj) or
                        inline.has_delete_permission(request, obj)):
                    continue
                if not inline.has_add_permission(request):
                    inline.max_num = 0
            inline_instances.append(inline)

        return inline_instances
    
    def save_formset(self, request, form, formset, change):
        """
        Given an inline formset save it to the database.
        """
        formset.save()
        
        #iterate through the nested formsets and save them
        #skip formsets, where the parent is marked for deletion
        deleted_forms = formset.deleted_forms
        for form in formset.forms:
            if hasattr(form, 'nested_formsets') and form not in deleted_forms:
                for nested_formset in form.nested_formsets:
                    self.save_formset(request, form, nested_formset, change)
                    
    def add_nested_inline_formsets(self, request, inline, formset, depth=0):
        if depth > 5:
            raise Exception("Maximum nesting depth reached (5)")
        for form in formset.forms:
            nested_formsets = []
            for nested_inline in inline.get_inline_instances(request):
                InlineFormSet = nested_inline.get_formset(request, form.instance)
                prefix = "%s-%s" % (form.prefix, InlineFormSet.get_default_prefix())
                
                #because of form nesting with extra=0 it might happen, that the post data doesn't include values for the formset.
                #This would lead to a Exception, because the ManagementForm construction fails. So we check if there is data available, and otherwise create an empty form
                keys = request.POST.keys()
                has_params = any(s.startswith(prefix) for s in keys)
                if request.method == 'POST' and has_params:
                    nested_formset = InlineFormSet(request.POST, request.FILES,
                                                   instance=form.instance,
                                                   prefix=prefix, queryset=nested_inline.queryset(request))
                else:
                    nested_formset = InlineFormSet(instance=form.instance,
                                                   prefix=prefix, queryset=nested_inline.queryset(request))
                nested_formsets.append(nested_formset)
                if nested_inline.inlines:
                    self.add_nested_inline_formsets(request, nested_inline, nested_formset, depth=depth+1)
            form.nested_formsets = nested_formsets
            
    def wrap_nested_inline_formsets(self, request, inline, formset):
        """wraps each formset in a helpers.InlineAdminFormset.
        @TODO someone with more inside knowledge should write done why this is done
        """
        media = None
        def get_media(extra_media):
            if media:
                return media + extra_media
            else:
                return extra_media
                        
        for form in formset.forms:
            wrapped_nested_formsets = []
            for nested_inline, nested_formset in zip(inline.get_inline_instances(request), form.nested_formsets):
                if form.instance.pk:
                    instance = form.instance
                else:
                    instance = None
                fieldsets = list(nested_inline.get_fieldsets(request))
                readonly = list(nested_inline.get_readonly_fields(request))
                prepopulated = dict(nested_inline.get_prepopulated_fields(request))
                wrapped_nested_formset = InlineAdminFormSet(nested_inline, nested_formset,
                    fieldsets, prepopulated, readonly, model_admin=self)
                wrapped_nested_formsets.append(wrapped_nested_formset)
                media = get_media(wrapped_nested_formset.media)
                if nested_inline.inlines:
                    media = get_media(self.wrap_nested_inline_formsets(request, nested_inline, nested_formset))
            form.nested_formsets = wrapped_nested_formsets
        return media
    
    def all_valid_with_nesting(self, formsets):
        """Recursively validate all nested formsets
        """
        if not all_valid(formsets):
            return False
        for formset in formsets:
            if not formset.is_bound:
                pass
            for form in formset:
                if hasattr(form, 'nested_formsets'):
                    if not self.all_valid_with_nesting(form.nested_formsets):
                        return False
        return True
    
    @csrf_protect_m
    @transaction.commit_on_success
    def add_view(self, request, form_url='', extra_context=None):
        "The 'add' admin view for this model."
        model = self.model
        opts = model._meta

        if not self.has_add_permission(request):
            raise PermissionDenied

        ModelForm = self.get_form(request)
        formsets = []
        inline_instances = self.get_inline_instances(request, None)
        if request.method == 'POST':
            form = ModelForm(request.POST, request.FILES)
            if form.is_valid():
                new_object = self.save_form(request, form, change=False)
                form_validated = True
            else:
                form_validated = False
                new_object = self.model()
            prefixes = {}
            for FormSet, inline in zip(self.get_formsets(request), inline_instances):
                prefix = FormSet.get_default_prefix()
                prefixes[prefix] = prefixes.get(prefix, 0) + 1
                if prefixes[prefix] != 1 or not prefix:
                    prefix = "%s-%s" % (prefix, prefixes[prefix])
                formset = FormSet(data=request.POST, files=request.FILES,
                                  instance=new_object,
                                  save_as_new="_saveasnew" in request.POST,
                                  prefix=prefix, queryset=inline.queryset(request))
                formsets.append(formset)
                if inline.inlines:
                    self.add_nested_inline_formsets(request, inline, formset)
            if self.all_valid_with_nesting(formsets) and form_validated:
                self.save_model(request, new_object, form, False)
                self.save_related(request, form, formsets, False)
                self.log_addition(request, new_object)
                return self.response_add(request, new_object)
        else:
            # Prepare the dict of initial data from the request.
            # We have to special-case M2Ms as a list of comma-separated PKs.
            initial = dict(request.GET.items())
            for k in initial:
                try:
                    f = opts.get_field(k)
                except models.FieldDoesNotExist:
                    continue
                if isinstance(f, models.ManyToManyField):
                    initial[k] = initial[k].split(",")
            form = ModelForm(initial=initial)
            prefixes = {}
            for FormSet, inline in zip(self.get_formsets(request), inline_instances):
                prefix = FormSet.get_default_prefix()
                prefixes[prefix] = prefixes.get(prefix, 0) + 1
                if prefixes[prefix] != 1 or not prefix:
                    prefix = "%s-%s" % (prefix, prefixes[prefix])
                formset = FormSet(instance=self.model(), prefix=prefix,
                                  queryset=inline.queryset(request))
                formsets.append(formset)
                if inline.inlines:
                    self.add_nested_inline_formsets(request, inline, formset)

        adminForm = AdminForm(form, list(self.get_fieldsets(request)),
            self.get_prepopulated_fields(request),
            self.get_readonly_fields(request),
            model_admin=self)
        media = self.media + adminForm.media

        inline_admin_formsets = []
        for inline, formset in zip(inline_instances, formsets):
            fieldsets = list(inline.get_fieldsets(request))
            readonly = list(inline.get_readonly_fields(request))
            prepopulated = dict(inline.get_prepopulated_fields(request))
            inline_admin_formset = InlineAdminFormSet(inline, formset,
                fieldsets, prepopulated, readonly, model_admin=self)
            inline_admin_formsets.append(inline_admin_formset)
            media = media + inline_admin_formset.media
            if inline.inlines:
                media = media + self.wrap_nested_inline_formsets(request, inline, formset)

        context = {
            'title': _('Add %s') % force_unicode(opts.verbose_name),
            'adminform': adminForm,
            'is_popup': "_popup" in request.REQUEST,
            'show_delete': False,
            'media': media,
            'inline_admin_formsets': inline_admin_formsets,
            'errors': AdminErrorList(form, formsets),
            'app_label': opts.app_label,
        }
        context.update(extra_context or {})
        return self.render_change_form(request, context, form_url=form_url, add=True)

    @csrf_protect_m
    @transaction.commit_on_success
    def change_view(self, request, object_id, form_url='', extra_context=None):
        "The 'change' admin view for this model."
        model = self.model
        opts = model._meta

        obj = self.get_object(request, unquote(object_id))

        if not self.has_change_permission(request, obj):
            raise PermissionDenied

        if obj is None:
            raise Http404(_('%(name)s object with primary key %(key)r does not exist.') % {'name': force_unicode(opts.verbose_name), 'key': escape(object_id)})

        if request.method == 'POST' and "_saveasnew" in request.POST:
            return self.add_view(request, form_url=reverse('admin:%s_%s_add' %
                                    (opts.app_label, opts.module_name),
                                    current_app=self.admin_site.name))

        ModelForm = self.get_form(request, obj)
        formsets = []
        inline_instances = self.get_inline_instances(request, obj)
        if request.method == 'POST':
            form = ModelForm(request.POST, request.FILES, instance=obj)
            if form.is_valid():
                form_validated = True
                new_object = self.save_form(request, form, change=True)
            else:
                form_validated = False
                new_object = obj
            prefixes = {}
            for FormSet, inline in zip(self.get_formsets(request, new_object), inline_instances):
                prefix = FormSet.get_default_prefix()
                prefixes[prefix] = prefixes.get(prefix, 0) + 1
                if prefixes[prefix] != 1 or not prefix:
                    prefix = "%s-%s" % (prefix, prefixes[prefix])
                formset = FormSet(request.POST, request.FILES,
                                  instance=new_object, prefix=prefix,
                                  queryset=inline.queryset(request))
                formsets.append(formset)
                if inline.inlines:
                    self.add_nested_inline_formsets(request, inline, formset)

            if self.all_valid_with_nesting(formsets) and form_validated:
                self.save_model(request, new_object, form, True)
                self.save_related(request, form, formsets, True)
                change_message = self.construct_change_message(request, form, formsets)
                self.log_change(request, new_object, change_message)
                return self.response_change(request, new_object)

        else:
            form = ModelForm(instance=obj)
            prefixes = {}
            for FormSet, inline in zip(self.get_formsets(request, obj), inline_instances):
                prefix = FormSet.get_default_prefix()
                prefixes[prefix] = prefixes.get(prefix, 0) + 1
                if prefixes[prefix] != 1 or not prefix:
                    prefix = "%s-%s" % (prefix, prefixes[prefix])
                formset = FormSet(instance=obj, prefix=prefix,
                                  queryset=inline.queryset(request))
                formsets.append(formset)
                if inline.inlines:
                    self.add_nested_inline_formsets(request, inline, formset)

        adminForm = AdminForm(form, self.get_fieldsets(request, obj),
            self.get_prepopulated_fields(request, obj),
            self.get_readonly_fields(request, obj),
            model_admin=self)
        media = self.media + adminForm.media

        inline_admin_formsets = []
        for inline, formset in zip(inline_instances, formsets):
            fieldsets = list(inline.get_fieldsets(request, obj))
            readonly = list(inline.get_readonly_fields(request, obj))
            prepopulated = dict(inline.get_prepopulated_fields(request, obj))
            inline_admin_formset = InlineAdminFormSet(inline, formset,
                fieldsets, prepopulated, readonly, model_admin=self)
            inline_admin_formsets.append(inline_admin_formset)
            media = media + inline_admin_formset.media
            if inline.inlines:
                media = media + self.wrap_nested_inline_formsets(request, inline, formset)

        context = {
            'title': _('Change %s') % force_unicode(opts.verbose_name),
            'adminform': adminForm,
            'object_id': object_id,
            'original': obj,
            'is_popup': "_popup" in request.REQUEST,
            'media': media,
            'inline_admin_formsets': inline_admin_formsets,
            'errors': AdminErrorList(form, formsets),
            'app_label': opts.app_label,
        }
        context.update(extra_context or {})
        return self.render_change_form(request, context, change=True, obj=obj, form_url=form_url)

class NestedInlineModelAdmin(InlineModelAdmin):
    inlines = []
    formset = BaseNestedInlineFormSet

    def get_form(self, request, obj=None, **kwargs):
        return super(NestedModelAdmin, self).get_form(
            request, obj, form=BaseNestedModelForm, **kwargs)
    
    def get_inline_instances(self, request, obj=None):
        inline_instances = []
        for inline_class in self.inlines:
            inline = inline_class(self.model, self.admin_site)
            if request:
                if not (inline.has_add_permission(request) or
                        inline.has_change_permission(request, obj) or
                        inline.has_delete_permission(request, obj)):
                    continue
                if not inline.has_add_permission(request):
                    inline.max_num = 0
            inline_instances.append(inline)

        return inline_instances
    
    def get_formsets(self, request, obj=None):
        for inline in self.get_inline_instances(request):
            yield inline.get_formset(request, obj)

class NestedStackedInline(NestedInlineModelAdmin):
    template = 'admin/edit_inline/stacked.html'
    
class NestedTabularInline(NestedInlineModelAdmin):
    template = 'admin/edit_inline/tabular.html'
