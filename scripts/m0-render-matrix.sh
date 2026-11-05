#!/usr/bin/env bash
# M0.1 验证：渲染全部 examples × 指定视图 × 双主题，对比 7fc526d 基线与 HEAD。
# 用法：bash scripts/m0-render-matrix.sh <legacy_dir> <out_dir>
set -u
LEGACY="$1"; OUT="$2"
mkdir -p "$OUT"
# file:view1,view2
MATRIX="
sample.csv:bar,pie,line
sample.json:bar,line
sample.xlsx:bar
sample-multi.csv:bar,line,matrix3d
sample-negative.csv:bar,line
sample-mixed.csv:bar
sample-wide.csv:bar,line
sample-waterfall.csv:bar
sample-line.csv:line
sample-line3d.csv:line3d
sample-scatter.csv:scatter
sample-scatter3d.csv:scatter3d
sample-pie3d.csv:pie3d
sample-pie3d-1d.csv:pie3d
sample-radar.csv:radar
sample-treemap.csv:treemap
sample-treemap-1d.csv:treemap
sample-sunburst.csv:sunburst
sample-gantt.csv:gantt
sample-fishbone.csv:fish
sample-heatmap.csv:heat
sample-heatmap-year.csv:heat
sample-sankey.csv:sankey
sample-boxplot.csv:box
sample-boxplot-summary.csv:box
sample-grid.csv:grid,pivot
sample-funnel.csv:funnel
sample-bullet.csv:bullet
sample-report.md:report
sample-note.txt:report
"
cd "$LEGACY" || exit 1
for entry in $MATRIX; do
  f="${entry%%:*}"; views="${entry##*:}"
  stem="${f//./_}"
  IFS=',' read -ra vs <<< "$views"
  for v in "${vs[@]}"; do
    for t in light dark; do
      out="$OUT/${stem}-${v}-${t}.html"
      python vizscape.py render "examples/$f" --view "$v" --theme "$t" --out "$out" >/dev/null 2>>"$OUT/render.err"
      [ -f "$out" ] || echo "MISS $f $v $t" >> "$OUT/missing.txt"
    done
  done
done
echo "done: $(ls "$OUT"/*.html 2>/dev/null | wc -l) files -> $OUT"
