/*{
  "DESCRIPTION": "Diagonal candy-cane stripes scroll like a spinning barber pole",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "stripes", "TYPE": "float", "MIN": 2.0, "MAX": 16.0, "DEFAULT": 6.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.05, "MAX": 0.5, "DEFAULT": 0.15 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;

  // Pick the diagonal axis so the twist reads even on a 1px-tall roofline:
  // on wide/flat buffers, fake the diagonal using x plus a synthetic ramp.
  float diag;
  if (RENDERSIZE.y < 2.0) {
    diag = uv.x * 2.0;
  } else {
    diag = uv.x + uv.y;
  }

  float scroll = diag * stripes - TIME * speed * 2.0;
  float wave = fract(scroll);
  float band = smoothstep(0.5 - sharpness, 0.5 + sharpness, wave);

  vec3 col = mix(colorA.rgb, colorB.rgb, band);
  gl_FragColor = vec4(col, 1.0);
}
