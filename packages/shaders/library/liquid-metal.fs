/*{
  "DESCRIPTION": "Polished liquid metal with a bright specular highlight sweeping across a slowly warping surface",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.3, 0.45, 0.9, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "shine", "TYPE": "float", "MIN": 2.0, "MAX": 16.0, "DEFAULT": 6.0 }
  ]
}*/
float surface(vec2 q, float t) {
  return sin(q.x * 1.7 + t * 0.5) * 0.5 + sin(q.y * 2.1 - t * 0.4 + sin(q.x * 1.1) * 1.5) * 0.5;
}
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(min(aspect, 3.0), 1.0) * 2.5;
  if (isLine) p.y = 0.3 * sin(p.x * 0.9);
  float t = mod(TIME * speed, 62.831853);
  // The surface's slope, by finite difference - it is what a highlight reflects off.
  float e = 0.05;
  float h = surface(p, t);
  float dx = surface(p + vec2(e, 0.0), t) - h;
  float dy = surface(p + vec2(0.0, e), t) - h;
  vec3 n = normalize(vec3(-dx / e, -dy / e, 1.2));
  // The light sweeps round once per 2 pi seconds at speed 1, so the highlight travels.
  vec3 light = normalize(vec3(cos(t * 1.0) * 1.2, sin(t * 1.0) * 1.2, 0.8));
  float spec = pow(max(dot(n, light), 0.0), shine);
  // Metal: the base colour shaded by slope, never below 0.4, with the hot highlight over it.
  float shade = 0.4 + 0.6 * (0.5 + 0.5 * n.z) * (0.6 + 0.4 * h);
  vec3 col = colorA.rgb * shade;
  col = mix(col, colorB.rgb, spec);
  gl_FragColor = vec4(col, 1.0);
}
