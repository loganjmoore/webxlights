/*{
  "DESCRIPTION": "A smooth glowing wash that fades between the chosen colours",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.0, 0.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "softness", "TYPE": "float", "MIN": 0.1, "MAX": 1.0, "DEFAULT": 0.7 }
  ]
}*/
void main() {
  float t = TIME * speed * 0.15;

  float cycle = fract(t);
  float seg = cycle * 3.0;
  float idx = floor(seg);
  float f = fract(seg);

  float edge = mix(0.05, 0.5, softness);
  float m = smoothstep(0.0, edge, f) * smoothstep(1.0, 1.0 - edge, f);
  m = clamp(f / max(edge, 0.001), 0.0, 1.0);
  m = smoothstep(0.0, 1.0, m);

  vec3 fromCol = colorA.rgb;
  vec3 toCol = colorB.rgb;

  if (idx < 0.5) {
    fromCol = colorA.rgb;
    toCol = colorB.rgb;
  } else if (idx < 1.5) {
    fromCol = colorB.rgb;
    toCol = colorC.rgb;
  } else {
    fromCol = colorC.rgb;
    toCol = colorA.rgb;
  }

  vec3 col = mix(fromCol, toCol, m);

  gl_FragColor = vec4(col, 1.0);
}
