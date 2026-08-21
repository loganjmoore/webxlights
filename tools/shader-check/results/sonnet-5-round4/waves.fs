/*{
  "DESCRIPTION": "Rolling ocean waves in bands of blue sweeping across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.0, 0.15, 0.5, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.6, 0.8, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 6.0, "DEFAULT": 2.5 },
    { "NAME": "foam", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.35 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;

  bool isFlat = RENDERSIZE.y < 2.0;
  float pos = isFlat ? uv.x : uv.y;

  float t = TIME * speed;

  float wave1 = sin(pos * scale * 6.2831853 - t * 1.7);
  float wave2 = sin(pos * scale * 6.2831853 * 1.8 - t * 2.6 + 1.3);
  float waveMix = wave1 * 0.65 + wave2 * 0.35;

  float shade = waveMix * 0.5 + 0.5;

  vec3 col = mix(colorA.rgb, colorB.rgb, shade);

  float crestSharp = mix(0.85, 0.6, foam);
  float crest = smoothstep(crestSharp, 1.0, waveMix);
  vec3 foamColor = vec3(1.0);
  col = mix(col, foamColor, crest * foam);

  float alongWave = isFlat ? uv.y : uv.x;
  float shimmer = sin(alongWave * 20.0 + t * 3.0) * 0.03;
  col += shimmer;

  col = clamp(col, 0.0, 1.0);

  gl_FragColor = vec4(col, 1.0);
}
