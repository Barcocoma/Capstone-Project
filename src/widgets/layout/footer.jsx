import PropTypes from "prop-types";
import { Typography } from "@material-tailwind/react";

export function Footer({ brandName }) {
  const year = new Date().getFullYear();

  return (
    <footer className="py-2">
      <div className="flex w-full flex-wrap items-center justify-center gap-6 px-2">
        <Typography variant="small" className="font-normal text-inherit text-center">
          &copy; {year} {brandName}. All rights reserved.
        </Typography>
      </div>
    </footer>
  );
}

Footer.defaultProps = {
  brandName: "Divine Life Memorial Park",
};

Footer.propTypes = {
  brandName: PropTypes.string,
};

Footer.displayName = "/src/widgets/layout/footer.jsx";

export default Footer;
