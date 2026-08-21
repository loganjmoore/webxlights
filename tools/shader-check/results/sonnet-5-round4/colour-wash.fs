/*{
  "DESCRIPTION": "A smooth glowing wash that fades gently between the palette colours",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.0, 0.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "softness", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 1.0 }
  ]
}*/
void main() {
  float t = TIME * speed * 0.15;

  float cyclePos = fract(t);
  float seg = cyclePos * 3.0;

  vec3 c0;
  vec3 c1;
  float localT;

  if (seg < 1.0) {
    c0 = colorA.rgb;
    c1 = colorB.rgb;
    localT = seg;
  } else if (seg < 2.0) {
    c0 = colorB.rgb;
    c1 = colorC.rgb;
    localT = seg - 1.0;
  } else {
    c0 = colorC.rgb;
    c1 = colorA.rgb;
    localT = seg - 2.0;
  }

  float edge = clamp(0.5 / max(softness, 0.1), 0.0, 0.5);
  float mixAmt = smoothstep(0.5 - edge, 0.5 + edge, localT);

  vec3 col = mix(c0, c1, mixAmt);

  gl_FragColor = vec4(col, 1.0);
}
