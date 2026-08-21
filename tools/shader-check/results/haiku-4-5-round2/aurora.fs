/*{
  "DESCRIPTION": "Aurora borealis curtains of shimmering light waves",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.5, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.5, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 0.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "waveCount", "TYPE": "float", "MIN": 1.0, "MAX": 8.0, "DEFAULT": 3.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  
  float tall = step(2.0, RENDERSIZE.y);
  float x = mix(uv.x, uv.y, 1.0 - tall);
  float y = mix(uv.y, uv.x, 1.0 - tall);
  
  float wave1 = sin(x * waveCount * 6.28318 + TIME * speed - y * 3.0) * 0.5 + 0.5;
  float wave2 = sin(x * waveCount * 6.28318 + TIME * speed * 0.7 + 2.09439 - y * 2.5) * 0.5 + 0.5;
  float wave3 = sin(x * waveCount * 6.28318 + TIME * speed * 0.5 + 4.18879 - y * 2.0) * 0.5 + 0.5;
  
  float shimmer = sin(TIME * speed * 3.0 + x * 4.0 + y * 8.0) * 0.25 + 0.75;
  
  vec3 col = mix(colorA.rgb, colorB.rgb, wave1);
  col = mix(col, colorC.rgb, wave2 * 0.6);
  col = col * (wave3 * 0.4 + 0.6) * shimmer;
  
  gl_FragColor = vec4(col, 1.0);
}
