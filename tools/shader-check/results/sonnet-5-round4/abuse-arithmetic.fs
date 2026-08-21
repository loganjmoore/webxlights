/*{
  "DESCRIPTION": "Bold pulsing candy stripe bands sweeping sideways for a festive light display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 1.0, "MAX": 12.0, "DEFAULT": 4.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;

  float axis;
  if (RENDERSIZE.y < 2.0) {
    axis = uv.x;
  } else {
    axis = uv.x + uv.y * 0.35;
  }

  float wave = fract(axis * scale - TIME * speed * 0.5);
  float edge = mix(0.02, 0.45, 1.0 - sharpness);
  float band = smoothstep(0.5 - edge, 0.5 + edge, wave);

  vec3 col = mix(colorA.rgb, colorB.rgb, band);

  float pulse = 0.85 + 0.15 * sin(TIME * speed * 2.0);
  col *= pulse;

  gl_FragColor = vec4(col, 1.0);
}
