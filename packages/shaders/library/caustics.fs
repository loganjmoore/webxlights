/*{
  "DESCRIPTION": "The bright wobbling caustics you see on the bottom of a swimming pool",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.1, 0.55, 1.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.85, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 1.0, "MAX": 5.0, "DEFAULT": 2.5 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(min(aspect, 3.0), 1.0) * scale;
  if (isLine) p.y = 0.4 * sin(p.x * 1.3);
  float t = mod(TIME * speed, 62.831853);
  // Two wobbling sine lattices; a caustic is where their bright lines cross. Whole tenths, so
  // the twenty-pi wrap is seamless.
  vec2 q = p + vec2(sin(p.y * 1.7 + t * 0.9), cos(p.x * 1.5 - t * 0.7)) * 0.4;
  float l1 = abs(sin(q.x * 2.1 + t * 0.5));
  float l2 = abs(sin(q.y * 2.3 - t * 0.6));
  float l3 = abs(sin((q.x + q.y) * 1.6 + t * 0.4));
  float net = pow(l1 * l2, 0.5) * 0.6 + pow(l2 * l3, 0.5) * 0.4;
  // The water is bright blue all over; the caustic lines flash white where the net is thin.
  float line = smoothstep(0.55, 0.15, net);
  vec3 col = colorA.rgb * (0.55 + 0.45 * (1.0 - net));
  col = mix(col, colorB.rgb, line * 0.9);
  gl_FragColor = vec4(col, 1.0);
}
