from django.db import models

class A(models.Model):
    name = models.CharField("name", max_length=255)

class B(models.Model):
    a = models.ForeignKey(A)
    name = models.CharField("name", max_length=255)
    
class C(models.Model):
    b = models.ForeignKey(B)
    name = models.CharField("name", max_length=255)