/*{
  "DESCRIPTION": "Diagonal candy-cane stripes spin continuously like a barber pole",
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

  // If the buffer is short and wide (a roofline), the spiral motion should
  // still read as horizontal travel; otherwise use the usual diagonal.
  float diag;
  if (RENDERSIZE.y < 2.0) {
    diag = uv.x - TIME * speed * 0.5;
  } else {
    diag = uv.x + uv.y - TIME * speed * 0.5;
  }

  float phase = fract(diag * stripes);
  float band = smoothstep(0.5 - sharpness, 0.5 + sharpness, phase)
             - smoothstep(1.0 - sharpness, 1.0 + sharpness, phase)
             + smoothstep(0.0 - sharpness, 0.0 + sharpness, phase) * step(phase, sharpness);

  band = clamp(band, 0.0, 1.0);

  vec3 col = mix(colorB.rgb, colorA.rgb, band);
  gl_FragColor = vec4(col, 1.0);
}
