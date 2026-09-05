/*{
  "DESCRIPTION": "A peppermint swirl of red and white turning slowly like a sweet wrapper",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.05, 0.1, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "arms", "TYPE": "float", "MIN": 2.0, "MAX": 8.0, "DEFAULT": 4.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  // 100 * 0.2 is whole, so the turn never jumps when the clock wraps.
  float t = mod(TIME * speed, 100.0) * 0.2;
  float s;
  if (isLine) {
    // A line shows the wrapper's stripes sliding along it.
    s = fract(uv.x * arms * 0.5 - t);
  } else {
    float r = length(p);
    float a = atan(p.y, p.x) / 6.2831853;
    // A swirl: the angle plus a gentle curl with radius, turning with time. Unlike the tunnel,
    // the curl is linear in r, which is what a peppermint looks like from the top.
    s = fract(a * arms + r * 1.6 - t);
  }
  float aa = (isLine ? 3.0 : 1.8) * arms / max(RENDERSIZE.x, 8.0);
  float band = smoothstep(0.5 + aa, 0.5 - aa, abs(s - 0.5) * 2.0);
  vec3 col = mix(colorB.rgb, colorA.rgb, band);
  // A little darker toward the rim, the way a sweet catches the light in the middle.
  float shade = isLine ? 1.0 : 1.0 - 0.25 * smoothstep(0.3, 0.75, length(p));
  gl_FragColor = vec4(col * shade, 1.0);
}
