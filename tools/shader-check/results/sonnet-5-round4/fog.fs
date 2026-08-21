/*{
  "DESCRIPTION": "Spooky green fog drifting slowly across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.02, 0.15, 0.05, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.2, 0.9, 0.3, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 0.6 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 6.0, "DEFAULT": 2.0 },
    { "NAME": "thickness", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isFlat = RENDERSIZE.y < 2.0;

  float t = TIME * speed * 0.15;

  float x = isFlat ? uv.x : uv.x;
  float y = isFlat ? uv.x * 0.35 : uv.y;

  float wave1 = sin((x * scale + t) * 6.28318) * 0.5 + 0.5;
  float wave2 = sin((x * scale * 1.7 - t * 1.3 + y * 2.0) * 6.28318) * 0.5 + 0.5;
  float wave3 = sin((x * scale * 0.6 + t * 0.6 - y * 1.2) * 6.28318) * 0.5 + 0.5;

  float fog = (wave1 * 0.5 + wave2 * 0.3 + wave3 * 0.2);

  float edge = mix(0.15, 0.85, thickness);
  fog = smoothstep(edge - 0.25, edge + 0.25, fog);

  float pulse = sin(TIME * speed * 0.3) * 0.05 + 0.95;
  fog *= pulse;

  vec3 col = mix(colorA.rgb, colorB.rgb, fog);

  gl_FragColor = vec4(col, 1.0);
}
