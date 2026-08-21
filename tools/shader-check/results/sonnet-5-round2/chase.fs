/*{
  "DESCRIPTION": "A bright chase of color running along the roofline",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "count", "TYPE": "float", "MIN": 2.0, "MAX": 16.0, "DEFAULT": 8.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.05, "MAX": 0.9, "DEFAULT": 0.35 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;

  // Drive the chase along x always; if the buffer is tall, fold y in too
  // so the chase still reads as horizontal motion along a roofline.
  float pos = uv.x;
  if (RENDERSIZE.y >= 2.0) {
    pos = uv.x;
  }

  float n = max(count, 1.0);
  float scaled = pos * n - TIME * speed * 2.0;
  float cell = fract(scaled);

  // Sharp pulse within each cell
  float half_w = clamp(sharpness, 0.05, 0.9) * 0.5;
  float d = abs(cell - 0.5);
  float pulse = 1.0 - smoothstep(half_w * 0.5, half_w, d);

  // Alternate base color per cell for a two-tone chase
  float cellIndex = floor(scaled);
  float toggle = mod(cellIndex, 2.0);
  vec3 base = mix(colorA.rgb, colorB.rgb, toggle);

  // Dim background so the chase pops, never fully black
  vec3 bg = mix(colorA.rgb, colorB.rgb, 0.5) * 0.08;

  vec3 col = mix(bg, base, pulse);

  gl_FragColor = vec4(col, 1.0);
}
