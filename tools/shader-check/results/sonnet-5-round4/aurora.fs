/*{
  "DESCRIPTION": "Shifting aurora borealis curtains of colored light waves",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.4, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.4, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.6, 0.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "waviness", "TYPE": "float", "MIN": 0.5, "MAX": 6.0, "DEFAULT": 2.5 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isFlat = RENDERSIZE.y < 2.0;

  float xAxis = isFlat ? uv.x : uv.x;
  float yAxis = isFlat ? 0.5 : uv.y;

  float t = TIME * speed * 0.35;

  float wave1 = sin(xAxis * waviness * 6.283 + t * 1.3) * 0.5 + 0.5;
  float wave2 = sin(xAxis * waviness * 4.0 - t * 1.7 + 1.5) * 0.5 + 0.5;
  float wave3 = sin(xAxis * waviness * 8.0 + t * 0.8 + 3.0) * 0.5 + 0.5;

  float mixA = wave1;
  float mixB = wave2;

  vec3 col = mix(colorA.rgb, colorB.rgb, mixA);
  col = mix(col, colorC.rgb, mixB * 0.6);

  float vertical;
  if (isFlat) {
    vertical = 1.0;
  } else {
    float shimmer = sin(xAxis * waviness * 10.0 + t * 2.5) * 0.08;
    float band = smoothstep(0.0, 0.55, yAxis + shimmer) * (1.0 - smoothstep(0.55, 1.0, yAxis));
    vertical = 0.35 + band * 0.9;
  }

  float brightness = mix(0.55, 1.0, wave3) * vertical;
  col *= brightness;

  gl_FragColor = vec4(col, 1.0);
}
