/*{
  "DESCRIPTION": "Twinkling stars scattered across the display with varying brightness",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "starColor", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "backgroundColor", "TYPE": "color", "DEFAULT": [0.0, 0.0, 0.2, 1.0] },
    { "NAME": "twinkleSpeed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 2.0 },
    { "NAME": "starDensity", "TYPE": "float", "MIN": 0.1, "MAX": 1.0, "DEFAULT": 0.3 }
  ]
}*/

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  vec3 finalColor = backgroundColor.rgb;
  
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    vec2 starPos = fract(vec2(
      sin(fi * 0.1 + 1.23) * 0.5 + 0.5,
      cos(fi * 0.15 + 4.56) * 0.5 + 0.5
    ));
    
    vec2 diff = uv - starPos;
    float dist = length(diff);
    
    float randomSeed = hash(starPos);
    if (randomSeed < starDensity) {
      float twinkle = sin(TIME * twinkleSpeed + randomSeed * 6.28) * 0.5 + 0.5;
      twinkle = twinkle * twinkle;
      
      float brightness = smoothstep(0.015, 0.0, dist) * twinkle;
      finalColor = mix(finalColor, starColor.rgb, brightness);
    }
  }
  
  gl_FragColor = vec4(finalColor, 1.0);
}
