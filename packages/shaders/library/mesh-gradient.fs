/*{
  "DESCRIPTION": "A few soft colour poles drifting slowly through each other like a mesh gradient",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.2, 0.5, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.2, 0.5, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 0.8, 0.2, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "softness", "TYPE": "float", "MIN": 0.05, "MAX": 0.4, "DEFAULT": 0.18 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  float ax = min(aspect, 3.0);
  vec2 p = (uv - 0.5) * vec2(ax, 1.0);
  float t = mod(TIME * speed, 62.831853);
  // Three poles on slow figures. Whole tenths, so the wrap at 20 pi is seamless.
  vec2 a = vec2(sin(t * 0.3), cos(t * 0.2)) * 0.45;
  vec2 b = vec2(cos(t * 0.2 + 2.0), sin(t * 0.4 + 1.0)) * 0.45;
  vec2 c = vec2(sin(t * 0.4 + 4.0), cos(t * 0.3 + 3.0)) * 0.45;
  if (isLine) {
    a.y = 0.0; b.y = 0.0; c.y = 0.0;
    a.x *= ax; b.x *= ax; c.x *= ax;
  }
  float da = length(p - a);
  float db = length(p - b);
  float dc = length(p - c);
  // Each pixel belongs to its nearest pole, and only crosses to the next over a narrow band -
  // wide enough to have no seams, narrow enough never to sit in the muddy midpoint.
  vec3 col;
  float d1;
  vec3 second;
  float d2;
  if (da <= db && da <= dc) { col = colorA.rgb; d1 = da; second = db < dc ? colorB.rgb : colorC.rgb; d2 = min(db, dc); }
  else if (db <= dc) { col = colorB.rgb; d1 = db; second = da < dc ? colorA.rgb : colorC.rgb; d2 = min(da, dc); }
  else { col = colorC.rgb; d1 = dc; second = da < db ? colorA.rgb : colorB.rgb; d2 = min(da, db); }
  float k = smoothstep(softness, 0.0, d2 - d1) * 0.5;
  col = mix(col, second, k);
  // Brighter near a pole, but never dim: a mesh gradient is a wash of light.
  float lit = 0.7 + 0.3 * (1.0 - smoothstep(0.0, 0.7, d1));
  gl_FragColor = vec4(col * lit, 1.0);
}
