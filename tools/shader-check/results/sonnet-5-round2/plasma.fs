/*{
  "DESCRIPTION": "Swirling plasma blending three Christmas colours",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 6.0, "DEFAULT": 2.5 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;

  bool isFlat = RENDERSIZE.y < 2.0;

  float t = TIME * speed;

  vec2 p;
  if (isFlat) {
    p = vec2(uv.x * scale * 2.0, uv.x * scale * 0.6);
  } else {
    p = uv * scale;
  }

  float swirl = sin(p.x * 2.0 + t) + sin(p.y * 2.0 - t * 0.8);
  float angle = swirl * 0.6;
  float c = cos(angle);
  float s = sin(angle);
  vec2 q = vec2(p.x * c - p.y * s, p.x * s + p.y * c);

  float plasma = sin(q.x * 1.5 + t)
               + sin(q.y * 1.5 - t * 1.2)
               + sin((q.x + q.y) * 1.2 + t * 0.7)
               + sin(length(q) * 1.8 - t * 1.5);

  plasma = plasma * 0.25 * 0.5 + 0.5;

  vec3 col;
  if (plasma < 0.5) {
    col = mix(colorA.rgb, colorB.rgb, smoothstep(0.0, 0.5, plasma));
  } else {
    col = mix(colorB.rgb, colorC.rgb, smoothstep(0.5, 1.0, plasma));
  }

  col = clamp(col * 1.15, 0.0, 1.0);

  gl_FragColor = vec4(col, 1.0);
}
