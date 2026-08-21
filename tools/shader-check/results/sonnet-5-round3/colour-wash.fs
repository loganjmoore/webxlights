/*{
  "DESCRIPTION": "A smooth wash that fades slowly between the chosen colours",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.0, 0.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "softness", "TYPE": "float", "MIN": 0.1, "MAX": 1.0, "DEFAULT": 1.0 }
  ]
}*/
void main() {
  float t = TIME * speed * 0.15;

  float cycle = fract(t);
  float seg = cycle * 3.0;
  float idx = floor(seg);
  float localT = fract(seg);

  float blendWidth = max(softness, 0.001);
  float mixAmt = smoothstep(0.0, blendWidth, localT);

  vec3 colA = mix(colorA.rgb, colorB.rgb, step(1.0, idx + 0.0) * 0.0 + step(0.5, idx) * 0.0);
  vec3 fromColor = mix(colorA.rgb, mix(colorB.rgb, colorC.rgb, step(1.5, idx)), step(0.5, idx));
  vec3 toColor = mix(colorB.rgb, mix(colorC.rgb, colorA.rgb, step(1.5, idx)), step(0.5, idx));

  vec3 washColor = mix(fromColor, toColor, mixAmt);

  gl_FragColor = vec4(washColor, 1.0);
}
