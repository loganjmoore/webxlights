/*{
  "DESCRIPTION": "Shafts of light angling down through haze, drifting slowly, bright where they cross",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.85, 0.4, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.3, 0.2, 0.6, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "rays", "TYPE": "float", "MIN": 2.0, "MAX": 8.0, "DEFAULT": 4.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  float t = mod(TIME * speed, 62.831853);
  // The shafts come from a point above the top-left and fan down to the right: an angle from
  // that point is what a ray is. On a line, the shafts are simply bands sliding along it.
  float y = isLine ? 0.3 : uv.y;
  vec2 from = vec2(-0.3, 1.4);
  vec2 d = vec2(uv.x * min(aspect, 2.0), y) - from;
  float angle = isLine ? uv.x * 2.0 : atan(d.x, -d.y);
  // Two sets of rays drifting at different rates; where they overlap it is brightest.
  float r1 = 0.5 + 0.5 * sin(angle * rays * 3.0 + t * 0.3);
  float r2 = 0.5 + 0.5 * sin(angle * rays * 4.7 - t * 0.2 + 1.0);
  float shaft = smoothstep(0.35, 0.75, r1) * 0.7 + smoothstep(0.4, 0.8, r2) * 0.5;
  // Haze: the shafts fade as they go down, and the whole scene keeps a dim floor.
  float haze = isLine ? 0.8 : 0.45 + 0.55 * y;
  vec3 col = colorB.rgb * 0.45;
  col = mix(col, colorA.rgb, clamp(shaft * haze, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
