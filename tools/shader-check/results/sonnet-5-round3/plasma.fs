/*{
  "DESCRIPTION": "Swirling plasma blend of three Christmas colors",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 6.0, "DEFAULT": 2.0 }
  ]
}*/
void main() {
  bool isLine = RENDERSIZE.y < 2.0;
  vec2 uv = isf_FragNormCoord * 2.0 - 1.0;
  uv.x *= scale;
  uv.y *= isLine ? 1.0 : scale;

  float t = TIME * speed;

  float x = isLine ? uv.x : uv.x;
  float y = isLine ? uv.x * 0.7 + 0.3 : uv.y;

  float p1 = sin(x * 1.7 + t);
  float p2 = sin((x * 0.6 + y * 1.3) * 1.3 - t * 1.3);
  float ang = atan(y, x);
  float rad = sqrt(x * x + y * y + 0.0001);
  float p3 = sin(rad * 3.0 - t * 1.7 + ang * 2.0);

  float plasma = (p1 + p2 + p3) / 3.0;
  plasma = plasma * 0.5 + 0.5;

  float band = plasma * 2.0;
  vec3 col;
  if (band < 1.0) {
    col = mix(colorA.rgb, colorB.rgb, smoothstep(0.0, 1.0, band));
  } else {
    col = mix(colorB.rgb, colorC.rgb, smoothstep(0.0, 1.0, band - 1.0));
  }

  gl_FragColor = vec4(col, 1.0);
}
