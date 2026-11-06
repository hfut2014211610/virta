"""vizlib.charts · 图族注册表：模板名 → 模块（render/SUMMARY/CONTRACT）。"""
from . import barline, scatter, scatter3d, line3d, pie, pie3d, bullet, funnel, radar, treemap, gantt, fishbone, heatmap, sankey, boxplot, sunburst, grid

REGISTRY = {}
for _m in (barline, scatter, scatter3d, line3d, pie, pie3d, bullet, funnel, radar, treemap, gantt, fishbone, heatmap, sankey, boxplot, sunburst, grid,):
    for _tpl in _m.TEMPLATE_IDS:
        REGISTRY[_tpl] = _m
