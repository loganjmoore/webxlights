/*{
  "DESCRIPTION": "A spiral tunnel turning slowly, pulling the eye into the middle of the display",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.1, 0.1, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.9, 0.2, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "arms", "TYPE": "float", "MIN": 1.0, "MAX": 4.0, "DEFAULT": 2.0 },
    { "NAME": "twist", "TYPE": "float", "MIN": 0.5, "MAX": 3.0, "DEFAULT": 1.4 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  // 100 * 0.3 is whole, so the turn never jumps when the clock wraps.
  float t = mod(TIME * speed, 100.0);
  float s;
  if (isLine) {
    // A line can't spiral, so the bands run in from both ends towards the middle instead.
    s = fract(abs(uv.x - 0.5) * 2.0 * arms + t * 0.3);
  } else {
    float r = length(p);
    float a = atan(p.y, p.x) / 6.2831853;
    // Angle plus log-radius is a spiral; adding time turns it and draws it inward.
    s = fract(a * arms + log(r + 0.03) * twist + t * 0.3);
  }
  float aa = (isLine ? 4.0 : 2.0) * arms / max(RENDERSIZE.x, 8.0);
  float band = smoothstep(0.5 + aa, 0.5 - aa, abs(s - 0.5) * 2.0);
  // The dark half of each arm is not black: a dim version of the other colour keeps the whole
  // tunnel readable while the bright arm carries the spin.
  vec3 col = mix(colorB.rgb * 0.22, colorA.rgb, band);
  // The centre glows, which is what makes it a tunnel rather than a pinwheel.
  float centre = isLine ? 0.0 : smoothstep(0.22, 0.0, length(p));
  col = mix(col, colorB.rgb, centre);
  gl_FragColor = vec4(col, 1.0);
}
