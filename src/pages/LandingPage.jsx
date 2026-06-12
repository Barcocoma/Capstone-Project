import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  Button,
  Typography,
  Accordion,
  AccordionHeader,
  AccordionBody,
} from "@material-tailwind/react";
import {
  MapIcon,
  UserGroupIcon,
  DocumentTextIcon,
  CurrencyDollarIcon,
  ClockIcon,
  ShieldCheckIcon,
  ChartBarIcon,
  PhoneIcon,
  EnvelopeIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/solid";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import SkyCursor from "@/components/SkyCursor";
import "./LandingPage.css";

export function LandingPage() {
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isHeaderSolid, setIsHeaderSolid] = useState(true);

  // Fix white line on scroll by preventing horizontal overflow
  useEffect(() => {
    document.body.classList.add('landing-page-active');
    document.documentElement.classList.add('landing-page-active');
    return () => {
      document.body.classList.remove('landing-page-active');
      document.documentElement.classList.remove('landing-page-active');
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setIsHeaderSolid(window.scrollY < 80);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleOpenFaq = (value) => setOpenFaq(openFaq === value ? 0 : value);

  const handleScrollTo = (selector) => {
    const target = document.querySelector(selector);
    if (target) {
      target.scrollIntoView({ behavior: "smooth" });
    }
    setMobileMenuOpen(false);
  };

  const handleSignIn = () => {
    setMobileMenuOpen(false);
    navigate("/auth/sign-in");
  };

  const features = [
    {
      icon: <MapIcon className="w-8 h-8" />,
      title: "Beautiful Garden Settings",
      description: "Choose from our peaceful Joy Garden and serene Peace Garden, each offering a tranquil environment for eternal rest."
    },
    {
      icon: <UserGroupIcon className="w-8 h-8" />,
      title: "Family-Centered Care",
      description: "Dedicated support for families during difficult times, with compassionate staff available to guide you through every step."
    },
    {
      icon: <CurrencyDollarIcon className="w-8 h-8" />,
      title: "Flexible Payment Options",
      description: "Affordable payment plans designed to ease financial burden, with transparent pricing and no hidden fees."
    },
    {
      icon: <DocumentTextIcon className="w-8 h-8" />,
      title: "Secure Documentation",
      description: "All ownership documents and records are safely stored and easily accessible when you need them."
    },
    {
      icon: <ClockIcon className="w-8 h-8" />,
      title: "24/7 Online Access",
      description: "View your lot information, make payments, and access important documents anytime, anywhere through our secure portal."
    },
    {
      icon: <ShieldCheckIcon className="w-8 h-8" />,
      title: "Peace of Mind",
      description: "Your family's resting place is protected and maintained with the highest standards of care and security."
    }
  ];

  const heroSlides = [
    {
      background: "/img/landingpage1.png",
      overlay: "bg-blue-gray-900/80",
      heading: "A Sacred Place for Your Loved Ones",
      subheading:
        "Divine Life Memorial Park provides a peaceful, dignified resting place with modern amenities and compassionate care for your family's eternal memories.",
      highlight:
        "Beautiful Gardens • Online Lot Selection • Flexible Payment Plans • 24/7 Access • Memorial Services",
    },
    {
      background: "/img/landingpage1.png",
      overlay: "bg-blue-gray-900/80",
      heading: "Reserve a Peaceful Space Today",
      subheading:
        "Choose from thoughtfully planned lawn lots and lock in a serene resting place while availability is open and flexible.",
      highlight:
        "Early Reservation Advantage • Exclusive Introductory Rates • Guided Selection Support • Seamless Paperwork • Trusted Legacy",
    },
  ];

  const [heroSlide, setHeroSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setHeroSlide((prev) => (prev + 1) % heroSlides.length),
      8000
    );
    return () => clearInterval(timer);
  }, [heroSlides.length]);

  const currentSlide = heroSlides[heroSlide];

  return (
    <div className="min-h-screen bg-blue-gray-50 overflow-x-hidden">
      <SkyCursor />
       {/* Header */}
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          isHeaderSolid ? "bg-white/95 backdrop-blur border-b border-white/40 shadow-sm" : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center">
              <img src="/img/divine_life.png" alt="Divine Life Memorial Park" className="h-10 w-auto mr-3" />
              <Typography variant="h5" className="font-bold text-gray-900 tracking-wide">
                Divine Life Memorial Park
              </Typography>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden lg:flex items-center space-x-6 text-sm text-gray-600">
                <div className="flex items-center">
                  <PhoneIcon className="w-4 h-4 mr-1" />
                  <span className="font-medium">(02) 123-4567</span>
                </div>
                <div className="flex items-center">
                  <EnvelopeIcon className="w-4 h-4 mr-1" />
                  <span className="font-medium">info@divinelife.com</span>
                </div>
              </div>
              <div className="hidden lg:flex items-center space-x-4">
                <button
                  className="text-gray-700 hover:text-blue-600 transition-colors duration-200 font-medium"
                  onClick={() => handleScrollTo("#about-section")}
                >
                  About
                </button>
                <button
                  className="text-gray-700 hover:text-blue-600 transition-colors duration-200 font-medium"
                  onClick={() => handleScrollTo("#faq-section")}
                >
                  FAQs
                </button>
                <Button
                  color="blue"
                  variant="outlined"
                  size="sm"
                  className="font-semibold"
                  onClick={handleSignIn}
                >
                  Sign In
                </Button>
              </div>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md p-2 text-gray-700 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 lg:hidden"
                onClick={() => setMobileMenuOpen((open) => !open)}
                aria-label="Toggle navigation"
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? (
                  <XMarkIcon className="h-6 w-6" />
                ) : (
                  <Bars3Icon className="h-6 w-6" />
                )}
              </button>
            </div>
          </div>
          {mobileMenuOpen && (
            <div className="lg:hidden border-t border-blue-gray-100 pt-4 pb-6">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <PhoneIcon className="w-4 h-4" />
                  <span className="font-medium">(02) 123-4567</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <EnvelopeIcon className="w-4 h-4" />
                  <span className="font-medium">info@divinelife.com</span>
                </div>
                <button
                  className="text-left text-gray-700 hover:text-blue-600 transition-colors duration-200 font-medium"
                  onClick={() => handleScrollTo("#about-section")}
                >
                  About
                </button>
                <button
                  className="text-left text-gray-700 hover:text-blue-600 transition-colors duration-200 font-medium"
                  onClick={() => handleScrollTo("#faq-section")}
                >
                  FAQs
                </button>
                <Button
                  color="blue"
                  variant="outlined"
                  size="sm"
                  className="font-semibold"
                  fullWidth
                  onClick={handleSignIn}
                >
                  Sign In
                </Button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden text-white w-full">
        {heroSlides.map((slide, index) => (
          <div
            key={`bg-${index}`}
            className={`hero-bg ${heroSlide === index ? "is-active" : ""}`}
            style={{ backgroundImage: `url('${slide.background}')` }}
          >
            <div className={`hero-bg-overlay ${slide.overlay}`} />
          </div>
        ))}
        <div className="relative py-20 min-h-[calc(100vh-80px)] flex items-center">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
            <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 items-center">
              <div key={`text-${heroSlide}`} className="hero-slide">
                <Typography variant="h1" className="text-4xl lg:text-6xl font-bold mb-6 leading-tight tracking-tight text-center lg:text-left">
                  {currentSlide.heading}
                </Typography>
                <Typography variant="lead" className="text-xl text-blue-gray-200 mb-8 leading-relaxed font-light text-center lg:text-left">
                  {currentSlide.subheading}
                </Typography>
                <div className="bg-blue-gray-800/50 rounded-lg p-6 mb-8 backdrop-blur-sm text-center lg:text-left">
                  <Typography variant="h6" className="text-blue-gray-100 mb-3 font-semibold tracking-wide">
                    Honoring Life, Preserving Memories
                  </Typography>
                  <Typography variant="small" className="text-blue-gray-300 leading-relaxed">
                    {currentSlide.highlight}
                  </Typography>
                </div>
              </div>
              <div key={`card-${heroSlide}`} className="hero-slide flex justify-center">
                <Card data-cursor="interactive" className="p-8 shadow-2xl max-w-md w-full backdrop-blur-sm bg-white/95 mx-auto">
                  <Typography variant="h4" className="text-center mb-6 text-gray-900 font-bold tracking-wide">
                    Access Your Account
                  </Typography>
                  <Typography variant="paragraph" className="text-center text-gray-600 mb-6 leading-relaxed font-light">
                    Sign in to view available lots, manage your account, and access all our services.
                  </Typography>
                  <Button
                    color="blue"
                    size="lg"
                    fullWidth
                    className="font-semibold tracking-wide"
                    onClick={() => navigate("/auth/sign-in")}
                  >
                    Sign In
                  </Button>
                </Card>
              </div>
            </div>
            <div className="relative mt-10 flex items-center justify-center">
              <button
                type="button"
                aria-label="Previous slide"
                className="hero-arrow hero-arrow--left"
                onClick={() => setHeroSlide((prev) => (prev - 1 + heroSlides.length) % heroSlides.length)}
              >
                ‹
              </button>
              <div className="hero-indicators">
                {heroSlides.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    aria-label={`Go to slide ${index + 1}`}
                    className={`hero-indicator ${heroSlide === index ? "is-active" : ""}`}
                    onClick={() => setHeroSlide(index)}
                  />
                ))}
              </div>
              <button
                type="button"
                aria-label="Next slide"
                className="hero-arrow hero-arrow--right"
                onClick={() => setHeroSlide((prev) => (prev + 1) % heroSlides.length)}
              >
                ›
              </button>
            </div>
          </div>
        </div>
      </section>

       {/* Features Section */}
       <section id="about-section" className="py-20 bg-white w-full overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
           <div className="text-center mb-16">
             <Typography variant="h2" className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4 tracking-tight leading-tight">
               Why Choose Divine Life Memorial Park?
             </Typography>
             <Typography variant="lead" className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed font-light">
               We understand that choosing a final resting place is one of life's most important decisions. Let us help you find peace and comfort in your choice.
             </Typography>
           </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
           {features.map((feature, index) => (
             <Card
               key={index}
               data-cursor="interactive"
               className="p-6 shadow-lg hover:shadow-xl transition-shadow duration-300"
             >
               <div className="text-blue-600 mb-4">
                 {feature.icon}
               </div>
               <Typography variant="h5" className="font-semibold text-gray-900 mb-3 tracking-wide">
                 {feature.title}
               </Typography>
               <Typography variant="paragraph" className="text-gray-600 leading-relaxed font-light">
                 {feature.description}
               </Typography>
             </Card>
           ))}
         </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-blue-gray-50 w-full overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            <div className="text-center" data-cursor="interactive">
              <div className="bg-blue-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <ChartBarIcon className="w-8 h-8 text-blue-600" />
              </div>
               <Typography variant="h5" className="font-semibold text-gray-900 mb-3 tracking-wide">
                 Easy Online Management
               </Typography>
               <Typography variant="paragraph" className="text-gray-600 leading-relaxed font-light">
                 Manage your lot information, view payment history, and access important documents from the comfort of your home.
               </Typography>
            </div>
            <div className="text-center" data-cursor="interactive">
               <div className="bg-green-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                 <UserGroupIcon className="w-8 h-8 text-green-600" />
               </div>
               <Typography variant="h5" className="font-semibold text-gray-900 mb-3 tracking-wide">
                 Compassionate Support
               </Typography>
               <Typography variant="paragraph" className="text-gray-600 leading-relaxed font-light">
                 Our caring staff is here to support you through every step, from initial planning to ongoing memorial services.
               </Typography>
            </div>
            <div className="text-center" data-cursor="interactive">
               <div className="bg-purple-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                 <ShieldCheckIcon className="w-8 h-8 text-purple-600" />
               </div>
               <Typography variant="h5" className="font-semibold text-gray-900 mb-3 tracking-wide">
                 Lasting Legacy
               </Typography>
               <Typography variant="paragraph" className="text-gray-600 leading-relaxed font-light">
                 Create a meaningful and lasting tribute to your loved ones in a place that will be maintained and honored for generations.
               </Typography>
            </div>
          </div>
        </div>
       </section>

       {/* FAQ Section */}
       <section id="faq-section" className="py-20 bg-white w-full overflow-x-hidden">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
             {/* Left: FAQ Content */}
             <div>
               <Typography variant="h2" className="text-3xl lg:text-4xl font-bold text-gray-900 mb-8 tracking-tight leading-tight">
                 Frequently Asked Questions
               </Typography>
               <div className="space-y-4">
                <Accordion open={openFaq === 1} icon={<ChevronDownIcon className={`w-5 h-5 transition-transform ${openFaq === 1 ? "rotate-180" : ""}`} />}>
                  <AccordionHeader
                    data-cursor="interactive"
                    onClick={() => handleOpenFaq(1)}
                    className="text-gray-900 hover:text-blue-500 font-semibold"
                  >
                     Where I can find your location?
                   </AccordionHeader>
                   <AccordionBody className="text-gray-700">
                     <Typography variant="paragraph" className="mb-2">
                       Our <Typography as="span" variant="small" className="font-bold text-gray-900">Main Office</Typography> is Located at <Typography as="span" variant="small" className="font-bold text-gray-900">238 JP Rizal Street, Brgy. Poblacion, Cabuyao, Laguna</Typography> at the back of Entrepreneur Bank
                     </Typography>
                     <Typography variant="paragraph">
                       <Typography as="span" variant="small" className="font-bold text-gray-900">Main Site</Typography> is Located at <Typography as="span" variant="small" className="font-bold text-gray-900">Brgy. Gulod 4024 Cabuyao, Laguna</Typography>. You can view our contact page for more info
                     </Typography>
                   </AccordionBody>
                 </Accordion>

                <Accordion open={openFaq === 2} icon={<ChevronDownIcon className={`w-5 h-5 transition-transform ${openFaq === 2 ? "rotate-180" : ""}`} />}>
                  <AccordionHeader
                    data-cursor="interactive"
                    onClick={() => handleOpenFaq(2)}
                    className="text-gray-900 hover:text-blue-500 font-semibold"
                  >
                     What day is available to visit?
                   </AccordionHeader>
                   <AccordionBody className="text-gray-700">
                     <Typography variant="paragraph" className="mb-2">
                       You can visit Divine Life Memorial Park daily at <Typography as="span" variant="small" className="font-bold text-gray-900">7:00 AM – 7:00 PM</Typography>
                     </Typography>
                     <Typography variant="paragraph">
                       Our main office opens <Typography as="span" variant="small" className="font-bold text-gray-900">Monday-Friday 8:00 AM – 4:00 PM</Typography>, and in <Typography as="span" variant="small" className="font-bold text-gray-900">Saturdays 9:00 AM - 12:00 PM</Typography>
                     </Typography>
                   </AccordionBody>
                 </Accordion>

                <Accordion open={openFaq === 3} icon={<ChevronDownIcon className={`w-5 h-5 transition-transform ${openFaq === 3 ? "rotate-180" : ""}`} />}>
                  <AccordionHeader
                    data-cursor="interactive"
                    onClick={() => handleOpenFaq(3)}
                    className="text-gray-900 hover:text-blue-500 font-semibold"
                  >
                     What are the requirements in purchasing Lawn Lot?
                   </AccordionHeader>
                   <AccordionBody className="text-gray-700">
                     <Typography variant="paragraph" className="mb-2">
                       It only needs <Typography as="span" variant="small" className="font-bold text-gray-900">Valid ID, Proof of Billing and Buyers Form (BAF)</Typography>
                     </Typography>
                     <ul className="list-disc list-inside space-y-1 text-sm">
                       <li>Assists Buyer and Seller on choosing their desired lot location</li>
                       <li>Discuss about product type and description, payment, plan, term and other park policies</li>
                     </ul>
                   </AccordionBody>
                 </Accordion>
               </div>
             </div>

            {/* Right: Illustration */}
            <div className="hidden lg:flex justify-center items-center">
              <div className="relative w-full max-w-md">
                <div className="absolute -top-6 -left-6 w-28 h-28 rounded-full bg-blue-100/60 blur-xl" />
                <div className="absolute -bottom-8 -right-8 w-32 h-32 rounded-full bg-blue-200/50 blur-2xl" />
                <img
                  src="/img/faqs.jpg"
                  alt="FAQ Illustration"
                  className="relative z-10 w-full h-auto rounded-2xl shadow-xl object-cover"
                />
              </div>
            </div>
           </div>
         </div>
       </section>



      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 w-full overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <div className="flex items-center mb-4">
                <img src="/img/divine_life.png" alt="Divine Life Memorial Park" className="h-8 w-auto mr-2" />
               <Typography variant="h6" className="font-bold tracking-wide">
                 Divine Life Memorial Park
               </Typography>
             </div>
             <Typography variant="small" className="text-gray-400 leading-relaxed font-light">
               A sacred place where memories live forever, providing peace and comfort for families during life's most difficult moments.
             </Typography>
            </div>
            <div>
              <Typography variant="h6" className="font-semibold mb-4 tracking-wide">Contact Information</Typography>
              <div className="space-y-2 text-sm text-gray-400">
                <div className="flex items-center">
                  <PhoneIcon className="w-4 h-4 mr-2" />
                  <span className="font-light">(02) 123-4567</span>
                </div>
                <div className="flex items-center">
                  <EnvelopeIcon className="w-4 h-4 mr-2" />
                  <span className="font-light">info@divinelife.com</span>
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center">
            <Typography variant="small" className="text-gray-400 font-light">
              © 2024 Divine Life Memorial Park. All rights reserved.
            </Typography>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
