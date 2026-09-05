/*{
  "DESCRIPTION": "A plume of smoke curling upward and spreading out, lit from below",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.5, 0.15, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.5, 0.55, 0.8, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "spread", "TYPE": "float", "MIN": 0.2, "MAX": 1.0, "DEFAULT": 0.55 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  float t = mod(TIME * speed, 62.831853);
  // On a line the plume rises along it from the left end. Otherwise from the bottom middle.
  float up = isLine ? uv.x : uv.y;
  float across = isLine ? 0.0 : (uv.x - 0.5) * min(aspect, 3.0);
  // The plume's centre line wanders as it rises; it widens with height. Whole tenths, seamless.
  float wander = sin(up * 4.0 - t * 1.3) * 0.15 * up + sin(up * 9.0 + t * 1.9) * 0.05;
  float width = 0.14 + spread * up;
  float core = 1.0 - smoothstep(0.0, width, abs(across - wander));
  // Turbulence inside the plume: curls that rise with it.
  float curl = 0.5 + 0.5 * sin(across * 9.0 + up * 12.0 - t * 2.4) * sin(up * 7.0 - t * 1.7);
  float density = core * (0.6 + 0.4 * curl) * (1.0 - up * 0.3);
  // Lit from below: hot at the base, cooler and greyer higher up, and a dim glow everywhere so
  // the dark is never off.
  vec3 col = mix(colorA.rgb, colorB.rgb, smoothstep(0.15, 0.6, up));
  float lit = 0.22 + 0.78 * density;
  gl_FragColor = vec4(col * lit + colorA.rgb * 0.1 * (1.0 - up), 1.0);
}
