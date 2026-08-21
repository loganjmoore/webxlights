/*{
  "DESCRIPTION": "Aurora borealis curtains of shimmering light flowing across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.5, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.5, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 0.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 3.0, "DEFAULT": 1.0 },
    { "NAME": "waveScale", "TYPE": "float", "MIN": 0.5, "MAX": 4.0, "DEFAULT": 2.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float time = TIME * speed * 0.5;
  
  float wave1 = sin(uv.x * waveScale + time) * 0.5 + 0.5;
  float wave2 = sin(uv.x * waveScale * 0.7 + time * 0.8 + 2.0) * 0.5 + 0.5;
  float wave3 = sin(uv.x * waveScale * 1.3 + time * 1.2 + 4.0) * 0.5 + 0.5;
  
  float ripple = sin(uv.y * 3.0 + time * 0.3) * 0.3 + 0.7;
  
  float shimmer = sin(uv.x * 8.0 + uv.y * 5.0 + time * 2.0) * 0.2 + 0.8;
  
  float vWave = sin((uv.y - 0.5) * 4.0 + time * 0.6) * 0.5 + 0.5;
  
  float blend1 = mix(wave1, wave2, 0.5);
  float blend2 = mix(wave2, wave3, 0.5);
  float finalWave = mix(blend1, blend2, vWave);
  
  vec3 col = mix(colorA.rgb, colorB.rgb, wave1);
  col = mix(col, colorC.rgb, wave3);
  col *= ripple * shimmer;
  col = mix(col, vec3(1.0), finalWave * 0.2);
  
  gl_FragColor = vec4(col, 1.0);
}
