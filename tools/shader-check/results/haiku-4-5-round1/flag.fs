/*{
  "DESCRIPTION": "American flag waving in the breeze",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "waveAmplitude", "TYPE": "float", "MIN": 0.0, "MAX": 0.3, "DEFAULT": 0.08 },
    { "NAME": "waveFrequency", "TYPE": "float", "MIN": 0.5, "MAX": 4.0, "DEFAULT": 2.0 },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  // Create wave distortion based on y position
  float wavePhase = TIME * speed;
  float wavey = uv.y + sin(uv.y * waveFrequency * 6.28318 + wavePhase) * waveAmplitude;
  
  // Clamp wave to valid range
  wavey = clamp(wavey, 0.0, 1.0);
  
  // Adjust x based on wave for a flag-like effect
  float distortedX = uv.x + sin(wavey * 3.14159) * waveAmplitude * 0.5;
  
  // Three vertical stripes: red, white, blue
  vec3 color = vec3(0.0);
  
  if (distortedX < 0.33333) {
    // Red stripe (left third)
    color = vec3(1.0, 0.0, 0.0);
  } else if (distortedX < 0.66667) {
    // White stripe (middle third)
    color = vec3(1.0, 1.0, 1.0);
  } else {
    // Blue stripe (right third)
    color = vec3(0.0, 0.1, 0.5);
  }
  
  // Add subtle star pattern in blue section for authenticity
  if (distortedX > 0.66667) {
    float starY = fract(wavey * 6.0) - 0.5;
    float starX = fract(distortedX * 8.0) - 0.5;
    float starDist = length(vec2(starX, starY));
    float star = smoothstep(0.15, 0.05, starDist);
    color = mix(color, vec3(1.0, 1.0, 1.0), star * 0.6);
  }
  
  gl_FragColor = vec4(color, 1.0);
}
