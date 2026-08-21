/*{
  "DESCRIPTION": "Diagonal candy cane stripes scrolling across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 1.0, "MAX": 20.0, "DEFAULT": 6.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.01, "MAX": 0.5, "DEFAULT": 0.08 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;

  // On very short/flat buffers (rooflines), fold y's contribution
  // into x so the diagonal motion still reads.
  float diag;
  if (RENDERSIZE.y < 2.0) {
    diag = uv.x * scale - TIME * speed * 0.5;
  } else {
    diag = (uv.x + uv.y) * scale - TIME * speed * 0.5;
  }

  float stripe = fract(diag);
  float band = smoothstep(0.5 - sharpness, 0.5 + sharpness, stripe);

  vec3 col = mix(colorA.rgb, colorB.rgb, band);
  gl_FragColor = vec4(col, 1.0);
}
