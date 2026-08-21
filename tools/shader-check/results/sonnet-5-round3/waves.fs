/*{
  "DESCRIPTION": "Rolling ocean waves of color sweeping across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.0, 0.2, 0.6, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.6, 0.8, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 6.0, "DEFAULT": 2.5 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;

  float x = isLine ? uv.x : uv.x;
  float t = TIME * speed;

  // Primary rolling wave motion, always driven along x for roofline safety
  float w1 = sin((x * scale * 6.28318) - t * 2.0);
  float w2 = sin((x * scale * 3.14159) - t * 1.3 + 1.5);
  float wave = w1 * 0.6 + w2 * 0.4;

  // On tall canvases, let vertical position modulate phase for a sense of depth
  float depthShift = isLine ? 0.0 : (uv.y - 0.5) * 1.5;
  wave += sin((x * scale * 6.28318) - t * 2.0 + depthShift) * 0.25;

  float n = wave * 0.5 + 0.5;

  // base ocean color blend
  vec3 col = mix(colorA.rgb, colorB.rgb, smoothstep(0.2, 0.85, n));

  // foam/crest highlight where wave peaks
  float crest = smoothstep(0.82, 1.0, n);
  col = mix(col, colorC.rgb, crest);

  gl_FragColor = vec4(col, 1.0);
}
