from django.forms.forms import BaseForm, ErrorDict
from django.forms.models import ModelForm, BaseInlineFormSet

class NestedFormMixin(object):
    def full_clean(self):
        """
        Cleans all of self.data and populates self._errors and
        self.cleaned_data.
        """
        self._errors = ErrorDict()
        if not self.is_bound: # Stop further processing.
            return
        self.cleaned_data = {}
        # If the form is permitted to be empty, and none of the form data has
        # changed from the initial data, short circuit any validation.
        if self.empty_permitted and not self.has_changed() and not self.dependency_has_changed():
            return
        self._clean_fields()
        self._clean_form()
        self._post_clean()
    
    def dependency_has_changed(self):
        """
        Returns true, if any dependent form has changed.
        This is needed to force validation, even if this form wasn't changed but a dependent form
        """
        return False

class BaseNestedForm(NestedFormMixin, BaseForm):
    pass

class NestedFormSetMixin(object):
    def dependency_has_changed(self):
        for form in self.forms:
            if form.has_changed() or form.dependency_has_changed():
                return True
        return False

class BaseNestedInlineFormSet(NestedFormSetMixin, BaseInlineFormSet):
    pass

class NestedModelFormMixin(NestedFormMixin):
    def dependency_has_changed(self):
        #check for the nested_formsets attribute, added by the admin app.
        #TODO this should be generalized
        if hasattr(self, 'nested_formsets'):
            for f in self.nested_formsets:
                return f.dependency_has_changed()
            
class BaseNestedModelForm(NestedModelFormMixin, ModelForm):
    pass