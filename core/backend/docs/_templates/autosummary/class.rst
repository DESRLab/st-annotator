{{ name | escape | underline}}

{% set methods_without_init = select_members(module ~ '.' ~ objname, methods, inherited_members)|select('ne', '__init__')|list %}
{% set own_attributes = select_members(module ~ '.' ~ objname, attributes, inherited_members) %}

.. currentmodule:: {{ module }}

.. autoclass:: {{ objname }}

   {% block methods %}
   {% if methods_without_init %}
   .. rubric:: {{ _('Methods') }}

   .. autosummary::
   {% for item in methods_without_init %}
      ~{{ name }}.{{ item }}
   {%- endfor %}

   {% for item in methods_without_init %}
   .. automethod:: {{ name }}.{{ item }}
   {%- endfor %}
   {% endif %}
   {% endblock %}

   {% block attributes %}
   {% if own_attributes %}
   .. rubric:: {{ _('Attributes') }}

   .. autosummary::
   {% for item in own_attributes %}
      ~{{ name }}.{{ item }}
   {%- endfor %}

   {% for item in own_attributes %}
   .. autoattribute:: {{ name }}.{{ item }}
   {%- endfor %}
   {% endif %}
   {% endblock %}
