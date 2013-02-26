from django.contrib import admin
from nested_inlines.admin import NestedModelAdmin, NestedTabularInline, NestedStackedInline

from models import A, B, C

class CInline(NestedTabularInline):
    model = C

class BInline(NestedStackedInline):
    model = B
    inlines = [CInline,]
    
class AAdmin(NestedModelAdmin):
    inlines = [BInline,]

admin.site.register(A, AAdmin)