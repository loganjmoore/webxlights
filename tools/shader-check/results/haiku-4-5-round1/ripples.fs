/*{
  "DESCRIPTION": "Raindrops creating expanding ripples across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.0, 0.5, 1.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 3.0, "DEFAULT": 1.0 },
    { "NAME": "frequency", "TYPE": "float", "MIN": 1.0, "MAX": 8.0, "DEFAULT": 4.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  vec3 col = colorA.rgb;
  
  float t = TIME * speed;
  
  for(int i = 0; i < 8; i++) {
    float fi = float(i);
    float phase = fract(t * 0.3 + fi / frequency);
    
    vec2 dropPos = vec2(sin(fi * 1.3 + t * 0.5) * 0.5 + 0.5, sin(fi * 2.1 + t * 0.3) * 0.3 + 0.5);
    
    float dist = length(uv - dropPos);
    float ripple = sin(dist * 20.0 - phase * 6.28) * exp(-dist * 3.0 - phase * 2.0);
    
    ripple = max(0.0, ripple);
    col = mix(col, colorB.rgb, ripple * 0.6);
  }
  
  gl_FragColor = vec4(col, 1.0);
}
