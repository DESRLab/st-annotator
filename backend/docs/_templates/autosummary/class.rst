{{ name | escape | underline}}

{% set methods_without_init = methods|select('ne', '__init__')|list %}

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
   {% if attributes %}
   .. rubric:: {{ _('Attributes') }}

   .. autosummary::
   {% for item in attributes %}
      ~{{ name }}.{{ item }}
   {%- endfor %}

   {% for item in attributes %}
   .. autoattribute:: {{ name }}.{{ item }}
   {%- endfor %}
   {% endif %}
   {% endblock %}
