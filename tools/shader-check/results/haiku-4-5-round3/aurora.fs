/*{
  "DESCRIPTION": "Aurora borealis curtains of shimmering light waves",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.5, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.5, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 0.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 8.0, "DEFAULT": 3.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float curtainY = uv.y;
  if (RENDERSIZE.y < 2.0) {
    curtainY = uv.x;
  }
  
  float wave1 = sin(uv.x * scale + TIME * speed + sin(curtainY * 3.0) * 0.5) * 0.5 + 0.5;
  float wave2 = sin(uv.x * scale * 0.7 - TIME * speed * 0.8 + cos(curtainY * 2.5) * 0.5) * 0.5 + 0.5;
  float wave3 = sin(uv.x * scale * 1.3 + TIME * speed * 1.2 + sin(curtainY * 4.0) * 0.3) * 0.5 + 0.5;
  
  float shimmer = sin(TIME * speed * 2.0 + length(uv) * 4.0) * 0.5 + 0.5;
  
  vec3 colorMix = mix(colorA.rgb, colorB.rgb, wave1);
  colorMix = mix(colorMix, colorC.rgb, wave2 * 0.6);
  
  float brightness = wave3 * shimmer * 0.9 + 0.1;
  vec3 finalColor = colorMix * brightness;
  
  gl_FragColor = vec4(finalColor, 1.0);
}
